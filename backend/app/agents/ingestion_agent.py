import hashlib
import io
import json
import re
from datetime import datetime, timezone
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


def _split_into_sections(title: str, raw_text: str) -> List[Dict[str, str]]:
    lines = [ln.strip() for ln in raw_text.splitlines() if ln.strip()]
    sections: List[Dict[str, str]] = []
    current_section = "Sección General"
    buffer: List[str] = []

    for line in lines:
        if line.lower().startswith(("sección", "seccion", "artículo", "articulo", "## ")):
            if buffer:
                sections.append({"section": current_section, "content": " ".join(buffer)})
                buffer = []
            current_section = line.lstrip("# ").strip()[:180]
        else:
            buffer.append(line)

    if buffer:
        sections.append({"section": current_section, "content": " ".join(buffer)})
    if not sections:
        sections.append({"section": f"Contenido de {title}", "content": raw_text[:2000]})
    return sections


def _get_drive_credentials():
    from google.oauth2 import service_account
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from pathlib import Path

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
    results = (
        service.files()
        .list(
            q=query,
            fields="files(id, name, mimeType, version, modifiedTime, webViewLink)",
            pageSize=100,
        )
        .execute()
    )
    files = results.get("files", [])
    docs: List[Dict[str, Any]] = []

    for f in files:
        file_id = f["id"]
        title = f["name"]
        mime = f["mimeType"]
        version = f.get("version") or f.get("modifiedTime", "1.0")
        drive_url = f.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"
        policy_code = title.split()[0] if title.upper().startswith("RH-") else "POL"

        raw_text = ""
        if mime == "application/vnd.google-apps.document":
            exported = service.files().export(fileId=file_id, mimeType="text/plain").execute()
            raw_text = exported.decode("utf-8", errors="ignore")
        elif mime == "application/vnd.google-apps.spreadsheet":
            exported = service.files().export(fileId=file_id, mimeType="text/csv").execute()
            raw_text = exported.decode("utf-8", errors="ignore")
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

        docs.append(
            {
                "drive_file_id": file_id,
                "policy_code": policy_code,
                "title": title,
                "mime_type": mime,
                "version": str(version),
                "effective_date": (f.get("modifiedTime") or "2026-01-01")[:10],
                "owner": "Dirección de Talento y Cultura",
                "drive_url": drive_url,
                "sections": _split_into_sections(title, raw_text),
            }
        )
    return docs


def sync_drive_policies(db: Session, override_docs: List[Dict[str, Any]] | None = None) -> Dict[str, int]:
    """
    Agente de ingesta: sincroniza políticas desde Google Drive (o catálogo de demostración),
    detectando altas, modificaciones, eliminaciones, metadatos faltantes, versiones contradictorias
    e intentos de inyección de instrucciones.
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
                        detail="No se encontraron PDFs, Google Docs ni Google Sheets en la carpeta configurada. Se conserva el catálogo de respaldo.",
                    )
                )
                source_docs = DEMO_DRIVE_POLICIES
        except Exception as exc:
            # Si aún no se ha autorizado token.json, permite arrancar con catálogo demo
            # y registra la alerta hasta completar OAuth 2.0.
            db.add(
                DocumentAuditAlert(
                    drive_file_id="oauth-pending",
                    title="Sincronización Google Drive",
                    alert_type="error_sincronizacion",
                    severity="alta",
                    detail=str(exc),
                )
            )
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
        pcode = item.get("policy_code", "POL")
        version = item.get("version", "")
        effective_date = item.get("effective_date", "")
        owner = item.get("owner", "")

        # Detectar metadatos faltantes
        missing_fields = [k for k, v in [("version", version), ("effective_date", effective_date), ("owner", owner)] if not v]
        if missing_fields:
            db.add(
                DocumentAuditAlert(
                    drive_file_id=fid,
                    title=item["title"],
                    alert_type="metadato_faltante",
                    severity="media",
                    detail=f"Faltan metadatos obligatorios: {', '.join(missing_fields)}.",
                )
            )
            stats["alerts"] += 1

        # Detectar versiones contradictorias para un mismo código de política
        if pcode in seen_policy_versions and seen_policy_versions[pcode][0] != version:
            db.add(
                DocumentAuditAlert(
                    drive_file_id=fid,
                    title=item["title"],
                    alert_type="version_contradictoria",
                    severity="alta",
                    detail=(
                        f"Se detectó conflicto de versión para {pcode}: "
                        f"{seen_policy_versions[pcode][0]} vs {version}."
                    ),
                )
            )
            stats["alerts"] += 1
        else:
            seen_policy_versions[pcode] = (version, fid)

        serialized = json.dumps(item["sections"], ensure_ascii=False, sort_keys=True) + f"|{version}|{effective_date}"
        content_hash = _compute_hash(serialized)

        existing = existing_docs.get(fid)
        if existing and existing.content_hash == content_hash and existing.status == "activo":
            existing.last_synced_at = now
            stats["unchanged"] += 1
            continue

        if not existing:
            doc_record = DriveDocument(
                drive_file_id=fid,
                policy_code=pcode,
                title=item["title"],
                mime_type=item["mime_type"],
                version=version or "sin-version",
                effective_date=effective_date or "sin-vigencia",
                owner=owner or "Sin responsable",
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
            doc_record.policy_code = pcode
            doc_record.title = item["title"]
            doc_record.mime_type = item["mime_type"]
            doc_record.version = version or "sin-version"
            doc_record.effective_date = effective_date or "sin-vigencia"
            doc_record.owner = owner or "Sin responsable"
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
                    policy_code=pcode,
                    title=item["title"],
                    section=sec["section"],
                    version=doc_record.version,
                    effective_date=doc_record.effective_date,
                    owner=doc_record.owner,
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
