import hashlib
import io
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Any
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DriveDocument, DocumentChunk, DocumentAuditAlert
from app.agents.embeddings import embed_text
from app.agents.policies_seed_data import DEMO_DRIVE_POLICIES

INJECTION_PATTERNS = [
    r"ignora\s+(las\s+)?instrucciones",
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"cambia\s+(el\s+)?rol",
    r"otorga\s+permisos",
    r"revela\s+(todos\s+los\s+)?salarios",
    r"system\s*prompt",
]


def _compute_hash(payload: str) -> str:
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _sanitize_document_text(text: str) -> tuple[str, bool]:
    """
    Trata instrucciones incrustadas en documentos como contenido inerte de consulta.
    Retorna (texto_sanitizado, se_detecto_inyeccion).
    """
    detected = False
    cleaned = text
    for pat in INJECTION_PATTERNS:
        if re.search(pat, cleaned, flags=re.IGNORECASE):
            detected = True
            cleaned = re.sub(pat, "[contenido de documento omitido por seguridad]", cleaned, flags=re.IGNORECASE)
    return cleaned, detected


def _excel_serial_to_iso(val: str) -> str:
    """Convierte números seriales de fecha de Excel (ej. 46024.0) a YYYY-MM-DD."""
    try:
        num = float(val)
        if 40000 <= num <= 60000 and val.replace(".", "", 1).isdigit():
            d = date(1899, 12, 30) + timedelta(days=int(num))
            return d.isoformat()
    except Exception:
        pass
    return val


def _extract_document_metadata(raw_text: str, filename: str) -> Dict[str, str]:
    """
    Extrae identificador, título, versión, vigencia y responsable desde el contenido
    del documento. No inventa valores faltantes; los deja vacíos para alertar a RRHH.
    """
    clean_text = raw_text.lstrip("\ufeff").strip()
    lines = [ln.strip() for ln in clean_text.splitlines() if ln.strip()]

    # Título: usar nombre de archivo si ya incluye código o primera línea significativa
    title = filename.strip() if filename else (lines[0][:180] if lines else "Documento sin título")

    # Identificador (ej. Identificador RH-01, RH-12 | Versión 1.1)
    id_match = re.search(r"(?:Identificador\s+)?(RH-\d{2})\b", clean_text, flags=re.IGNORECASE)
    if not id_match and filename:
        id_match = re.search(r"\b(RH-\d{2})\b", filename, flags=re.IGNORECASE)
    policy_code = id_match.group(1).upper() if id_match else ""

    # Versión (ej. Versión 1.1)
    ver_match = re.search(r"Versi[oó]n\s+([0-9]+(?:\.[0-9]+)*)", clean_text, flags=re.IGNORECASE)
    version = ver_match.group(1) if ver_match else ""

    # Vigencia (ej. Fecha de vigencia del caso 17 de noviembre de 2026 | Vigencia enero a diciembre de 2026)
    vig_match = re.search(
        r"(?:Fecha de vigencia del caso|Fecha de vigencia|Vigencia)\s*[:\-]?\s*([^\n|]+)",
        clean_text,
        flags=re.IGNORECASE,
    )
    effective_date = vig_match.group(1).strip() if vig_match else ""
    if not effective_date:
        # En hojas con columna 'vigencia'
        col_vig = re.search(r"\b2026-\d{2}-\d{2}\b", clean_text)
        if col_vig:
            effective_date = col_vig.group(0)

    # Responsable (ej. Responsable Operaciones de RRHH)
    resp_match = re.search(
        r"Responsable\s*[:\-]?\s*([^\n|]+)",
        clean_text,
        flags=re.IGNORECASE,
    )
    owner = resp_match.group(1).strip() if resp_match else ""
    # Limpiar si capturó la siguiente etiqueta en línea continua (Google Docs exportado como texto plano)
    if owner:
        for stop_kw in ["Ámbito", "Ambito", "Objetivo", "Programación", "Concepto"]:
            if stop_kw in owner:
                owner = owner.split(stop_kw)[0].strip()

    if effective_date:
        for stop_kw in ["Responsable", "Ámbito", "Ambito", "Objetivo"]:
            if stop_kw in effective_date:
                effective_date = effective_date.split(stop_kw)[0].strip()

    return {
        "policy_code": policy_code,
        "title": title,
        "version": version,
        "effective_date": effective_date[:80] if effective_date else "",
        "owner": owner[:120] if owner else "",
    }


def _parse_xlsx_all_sheets(xlsx_bytes: bytes) -> List[Dict[str, str]]:
    """Extrae todas las pestañas de un Google Sheet exportado como .xlsx convirtiendo fechas Excel."""
    sections: List[Dict[str, str]] = []
    with zipfile.ZipFile(io.BytesIO(xlsx_bytes)) as zf:
        shared_strings: List[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in ss_root.iter():
                if si.tag.endswith("}si") or si.tag == "si":
                    texts = [t.text or "" for t in si.iter() if t.tag.endswith("}t") or t.tag == "t"]
                    shared_strings.append("".join(texts))

        wb_root = ET.fromstring(zf.read("xl/workbook.xml"))
        rels_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rid_to_target: Dict[str, str] = {}
        for rel in rels_root.iter():
            if rel.tag.endswith("Relationship"):
                rid = rel.attrib.get("Id", "")
                target = rel.attrib.get("Target", "").lstrip("/")
                if not target.startswith("xl/"):
                    target = f"xl/{target}"
                rid_to_target[rid] = target

        for sh in wb_root.iter():
            if sh.tag.endswith("}sheet") or sh.tag == "sheet":
                sheet_name = sh.attrib.get("name", "Hoja")
                rid = next((v for k, v in sh.attrib.items() if k.endswith("}id") or k == "r:id"), "")
                sheet_path = rid_to_target.get(rid)
                if not sheet_path or sheet_path not in zf.namelist():
                    continue
                sh_root = ET.fromstring(zf.read(sheet_path))
                row_lines: List[str] = []
                for row in sh_root.iter():
                    if row.tag.endswith("}row") or row.tag == "row":
                        cells: List[str] = []
                        for c in row:
                            ctype = c.attrib.get("t", "")
                            val = ""
                            for child in c:
                                if child.tag.endswith("}v") or child.tag == "v":
                                    raw_v = child.text or ""
                                    if ctype == "s" and raw_v.isdigit():
                                        idx = int(raw_v)
                                        val = shared_strings[idx] if idx < len(shared_strings) else raw_v
                                    else:
                                        val = _excel_serial_to_iso(raw_v)
                                elif child.tag.endswith("}is") or child.tag == "is":
                                    val = "".join(t.text or "" for t in child.iter() if t.tag.endswith("}t") or t.tag == "t")
                            if val.strip():
                                cells.append(val.strip())
                        if cells:
                            row_lines.append(" | ".join(cells))
                if row_lines:
                    sections.append({"section": f"Pestaña: {sheet_name}", "content": "\n".join(row_lines)})
    return sections


def _chunk_by_words_and_tables(sec_name: str, text_lines: List[str], max_chars: int = 850) -> List[Dict[str, str]]:
    """
    Divide por párrafos y límites de palabra (nunca corta palabras a la mitad).
    Conserva el encabezado de tablas junto con sus filas.
    """
    chunks: List[Dict[str, str]] = []
    current_lines: List[str] = []
    current_len = 0
    table_header: str | None = None

    for line in text_lines:
        is_table_row = "|" in line and len(line.split("|")) >= 3
        if is_table_row and table_header is None and ("Concepto" in line or "Antigüedad" in line or "Fecha" in line or "Días" in line):
            table_header = line

        if current_len + len(line) + 1 > max_chars and current_lines:
            chunks.append(
                {
                    "section": sec_name if not chunks else f"{sec_name} (parte {len(chunks) + 1})",
                    "content": "\n".join(current_lines).strip(),
                }
            )
            # Conservar contexto de último párrafo o encabezado de tabla
            carry = [table_header] if (is_table_row and table_header) else ([current_lines[-1]] if len(current_lines[-1]) < 180 else [])
            current_lines = list(carry)
            current_len = sum(len(x) + 1 for x in current_lines)

        # Si una sola línea supera max_chars, dividir por límites de palabra
        if len(line) > max_chars:
            words = line.split()
            buf: List[str] = []
            blen = 0
            for w in words:
                if blen + len(w) + 1 > max_chars and buf:
                    chunks.append(
                        {
                            "section": sec_name if not chunks else f"{sec_name} (parte {len(chunks) + 1})",
                            "content": " ".join(buf),
                        }
                    )
                    overlap_words = buf[-15:] if len(buf) > 15 else buf
                    buf = list(overlap_words)
                    blen = sum(len(x) + 1 for x in buf)
                buf.append(w)
                blen += len(w) + 1
            if buf:
                current_lines.append(" ".join(buf))
                current_len += blen
        else:
            current_lines.append(line)
            current_len += len(line) + 1

    if current_lines:
        chunks.append(
            {
                "section": sec_name if not chunks else f"{sec_name} (parte {len(chunks) + 1})",
                "content": "\n".join(current_lines).strip(),
            }
        )
    return chunks


def _split_into_sections(title: str, raw_text: str) -> List[Dict[str, str]]:
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    sections: List[Dict[str, str]] = []
    current_section = "Encabezado y alcance"
    buffer: List[str] = []

    heading_re = re.compile(
        r"^(sección|seccion|artículo|articulo|##|\d+\.\s+[A-ZÁÉÍÓÚÑ]|objetivo y alcance|fundamento|reglas|procedimiento|tabla de vacaciones|escalamiento)",
        re.IGNORECASE,
    )

    for line in lines:
        if heading_re.match(line) and len(line) < 120:
            if buffer:
                sections.extend(_chunk_by_words_and_tables(current_section, buffer))
                buffer = []
            current_section = line.lstrip("# ").strip()[:160]
        else:
            buffer.append(line)

    if buffer:
        sections.extend(_chunk_by_words_and_tables(current_section, buffer))
    if not sections:
        sections.append({"section": f"Contenido de {title}", "content": raw_text[:2000]})
    return sections


def _get_drive_credentials():
    from google.oauth2 import service_account
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request

    scopes = ["https://www.googleapis.com/auth/drive.readonly"]
    if settings.GOOGLE_AUTH_MODE == "oauth2":
        token_path = Path(settings.GOOGLE_OAUTH_TOKEN_FILE)
        if not token_path.exists():
            raise RuntimeError(
                "Falta token.json de OAuth 2.0. Autoriza la aplicación en /api/ingestion/oauth/url primero."
            )
        creds = Credentials.from_authorized_user_file(str(token_path), scopes=scopes)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            token_path.write_text(creds.to_json(), encoding="utf-8")
        return creds

    if settings.GOOGLE_SERVICE_ACCOUNT_JSON:
        info = json.loads(settings.GOOGLE_SERVICE_ACCOUNT_JSON)
        return service_account.Credentials.from_service_account_info(info, scopes=scopes)
    if settings.GOOGLE_SERVICE_ACCOUNT_FILE:
        return service_account.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=scopes
        )
    raise RuntimeError("Faltan credenciales de Google Drive en variables de entorno.")


def _fetch_real_drive_documents() -> List[Dict[str, Any]]:
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaIoBaseDownload
    from pypdf import PdfReader

    creds = _get_drive_credentials()
    service = build("drive", "v3", credentials=creds)
    query = (
        f"'{settings.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false and "
        "(mimeType = 'application/vnd.google-apps.document' or "
        "mimeType = 'application/vnd.google-apps.spreadsheet' or "
        "mimeType = 'application/pdf')"
    )
    files: List[Dict[str, Any]] = []
    page_token = None
    while True:
        results = (
            service.files()
            .list(
                q=query,
                fields="nextPageToken, files(id, name, mimeType, version, modifiedTime, webViewLink)",
                pageSize=100,
                pageToken=page_token,
            )
            .execute()
        )
        files.extend(results.get("files", []))
        page_token = results.get("nextPageToken")
        if not page_token:
            break

    docs: List[Dict[str, Any]] = []
    for f in files:
        file_id = f["id"]
        filename = f["name"]
        mime = f["mimeType"]
        drive_rev = str(f.get("version") or "")
        drive_mod = str(f.get("modifiedTime") or "")
        drive_url = f.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"

        raw_text = ""
        sections: List[Dict[str, str]] = []
        if mime == "application/vnd.google-apps.document":
            exported = service.files().export(fileId=file_id, mimeType="text/plain").execute()
            raw_text = exported.decode("utf-8", errors="ignore")
            sections = _split_into_sections(filename, raw_text)
        elif mime == "application/vnd.google-apps.spreadsheet":
            exported = service.files().export(
                fileId=file_id,
                mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ).execute()
            sections = _parse_xlsx_all_sheets(exported)
            raw_text = "\n".join(s["content"] for s in sections)
        elif mime == "application/pdf":
            request = service.files().get_media(fileId=file_id)
            buf = io.BytesIO()
            downloader = MediaIoBaseDownload(buf, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()
            buf.seek(0)
            reader = PdfReader(buf)
            raw_text = "\n".join(page.extract_text() or "" for page in reader.pages)
            sections = _split_into_sections(filename, raw_text)

        meta = _extract_document_metadata(raw_text, filename)
        docs.append(
            {
                "drive_file_id": file_id,
                "policy_code": meta["policy_code"],
                "title": meta["title"],
                "mime_type": mime,
                "version": meta["version"],
                "effective_date": meta["effective_date"],
                "owner": meta["owner"],
                "drive_revision": drive_rev,
                "drive_modified_at": drive_mod,
                "drive_url": drive_url,
                "sections": sections,
            }
        )
    return docs


def sync_drive_policies(db: Session, override_docs: List[Dict[str, Any]] | None = None) -> Dict[str, int]:
    """
    Agente de ingesta: sincroniza políticas desde Google Drive (o catálogo de demostración),
    conservando el último índice válido si ocurre un error de conexión.
    """
    if override_docs is not None:
        source_docs = override_docs
    elif settings.GOOGLE_DRIVE_ENABLED and settings.GOOGLE_DRIVE_FOLDER_ID:
        try:
            source_docs = _fetch_real_drive_documents()
            if not source_docs:
                db.add(
                    DocumentAuditAlert(
                        drive_file_id=settings.GOOGLE_DRIVE_FOLDER_ID,
                        title="Carpeta de Google Drive vacía",
                        alert_type="error_sincronizacion",
                        severity="media",
                        detail="No se encontraron PDFs, Google Docs ni Google Sheets en la carpeta configurada. Se conserva el último índice válido.",
                    )
                )
                db.commit()
                return {"added": 0, "updated": 0, "deleted": 0, "unchanged": db.query(DriveDocument).filter(DriveDocument.status == "activo").count(), "alerts": 1}
        except Exception as exc:
            db.add(
                DocumentAuditAlert(
                    drive_file_id="drive-sync-error",
                    title="Error de sincronización Google Drive",
                    alert_type="error_sincronizacion",
                    severity="alta",
                    detail=f"Se conservó el último índice válido. Detalle: {exc}",
                )
            )
            db.commit()
            has_existing = db.query(DriveDocument).filter(DriveDocument.status == "activo").count() > 0
            if has_existing:
                return {"added": 0, "updated": 0, "deleted": 0, "unchanged": db.query(DriveDocument).filter(DriveDocument.status == "activo").count(), "alerts": 1}
            source_docs = DEMO_DRIVE_POLICIES
    else:
        source_docs = DEMO_DRIVE_POLICIES

    existing_docs = {doc.drive_file_id: doc for doc in db.query(DriveDocument).all()}
    seen_ids = set()
    seen_policy_versions: Dict[str, tuple[str, str]] = {}
    stats = {"added": 0, "updated": 0, "deleted": 0, "unchanged": 0, "alerts": 0}
    now = datetime.now(timezone.utc)

    for item in source_docs:
        fid = item["drive_file_id"]
        seen_ids.add(fid)
        pcode = item.get("policy_code", "")
        version = item.get("version", "")
        effective_date = item.get("effective_date", "")
        owner = item.get("owner", "")

        # Detectar metadatos obligatorios faltantes sin inventarlos
        missing_fields = [
            k for k, v in [("identificador", pcode), ("version", version), ("vigencia", effective_date), ("responsable", owner)] if not v
        ]
        if missing_fields:
            db.add(
                DocumentAuditAlert(
                    drive_file_id=fid,
                    title=item["title"],
                    alert_type="metadato_faltante",
                    severity="media",
                    detail=f"Faltan metadatos en el contenido del documento: {', '.join(missing_fields)}.",
                )
            )
            stats["alerts"] += 1

        # Detectar versiones contradictorias para un mismo código de política
        if pcode and version:
            if pcode in seen_policy_versions and seen_policy_versions[pcode][0] != version:
                db.add(
                    DocumentAuditAlert(
                        drive_file_id=fid,
                        title=item["title"],
                        alert_type="version_contradictoria",
                        severity="alta",
                        detail=f"Conflicto de versión para {pcode}: {seen_policy_versions[pcode][0]} vs {version}.",
                    )
                )
                stats["alerts"] += 1
            else:
                seen_policy_versions[pcode] = (version, fid)

        serialized = json.dumps(item["sections"], ensure_ascii=False, sort_keys=True) + f"|{pcode}|{version}|{effective_date}|{owner}"
        content_hash = _compute_hash(serialized)

        existing = existing_docs.get(fid)
        if existing and existing.content_hash == content_hash and existing.status == "activo":
            existing.last_synced_at = now
            stats["unchanged"] += 1
            continue

        stored_pcode = pcode or "SIN-ID"
        stored_ver = version or "Sin versión"
        stored_eff = effective_date or "Sin vigencia"
        stored_owner = owner or "Sin responsable"

        if not existing:
            doc_record = DriveDocument(
                drive_file_id=fid,
                policy_code=stored_pcode,
                title=item["title"],
                mime_type=item["mime_type"],
                version=stored_ver,
                effective_date=stored_eff,
                owner=stored_owner,
                drive_url=item["drive_url"],
                content_hash=content_hash,
                status="activo",
                last_synced_at=now,
            )
            db.add(doc_record)
            db.flush()
            stats["added"] += 1
        else:
            doc_record = existing
            doc_record.policy_code = stored_pcode
            doc_record.title = item["title"]
            doc_record.mime_type = item["mime_type"]
            doc_record.version = stored_ver
            doc_record.effective_date = stored_eff
            doc_record.owner = stored_owner
            doc_record.drive_url = item["drive_url"]
            doc_record.content_hash = content_hash
            doc_record.status = "activo"
            doc_record.last_synced_at = now
            db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_record.id).delete()
            stats["updated"] += 1

        for idx, sec in enumerate(item["sections"]):
            clean_content, inj = _sanitize_document_text(sec["content"])
            if inj:
                db.add(
                    DocumentAuditAlert(
                        drive_file_id=fid,
                        title=item["title"],
                        alert_type="inyeccion_detectada",
                        severity="alta",
                        detail=f"Se neutralizó un patrón de instrucción no autorizada en '{sec['section']}'.",
                    )
                )
                stats["alerts"] += 1

            chunk_text = f"{item['title']} — {sec['section']}\n{clean_content}"
            emb = embed_text(chunk_text)
            db.add(
                DocumentChunk(
                    document_id=doc_record.id,
                    drive_file_id=fid,
                    policy_code=stored_pcode,
                    title=item["title"],
                    section=sec["section"],
                    version=stored_ver,
                    effective_date=stored_eff,
                    owner=stored_owner,
                    drive_url=item["drive_url"],
                    chunk_index=idx,
                    content=clean_content,
                    embedding=emb,
                )
            )

    for fid, doc in existing_docs.items():
        if fid not in seen_ids and doc.status != "eliminado":
            doc.status = "eliminado"
            db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete()
            stats["deleted"] += 1

    db.commit()
    return stats
