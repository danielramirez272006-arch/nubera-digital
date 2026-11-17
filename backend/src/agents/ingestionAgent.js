import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import pdfParse from 'pdf-parse';
import * as XLSX from 'xlsx';
import { config } from '../config.js';
import { embedText } from './embeddings.js';

const INJECTION_PATTERNS = [
  /ignora\s+(las\s+)?instrucciones/gi,
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /cambia\s+(el\s+)?rol/gi,
  /otorga\s+permisos/gi,
  /revela\s+(todos\s+los\s+)?salarios/gi,
  /system\s*prompt/gi,
];

let ingestionRunning = false;

function computeHash(payload) {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function sanitizeDocumentText(text) {
  let detected = false;
  let cleaned = String(text || '');
  for (const pat of INJECTION_PATTERNS) {
    pat.lastIndex = 0;
    if (pat.test(cleaned)) {
      detected = true;
      pat.lastIndex = 0;
      cleaned = cleaned.replace(pat, '[contenido de documento omitido por seguridad]');
    }
  }
  return { cleaned, detected };
}

function excelSerialToIso(val) {
  const str = String(val ?? '').trim();
  if (!str || !/^\d+(?:\.\d+)?$/.test(str)) return str;
  const num = Number(str);
  if (num >= 40000 && num <= 60000) {
    const baseMs = Date.UTC(1899, 11, 30);
    const dt = new Date(baseMs + Math.trunc(num) * 86400 * 1000);
    return dt.toISOString().slice(0, 10);
  }
  return str;
}

export function extractDocumentMetadata(rawText, filename) {
  const cleanText = String(rawText || '').replace(/^\uFEFF/, '').trim();
  const lines = cleanText
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);

  const title = filename?.trim() ? filename.trim() : lines[0]?.slice(0, 180) || 'Documento sin título';

  let idMatch = cleanText.match(/(?:Identificador\s+)?(RH-\d{2})\b/i);
  if (!idMatch && filename) {
    idMatch = filename.match(/\b(RH-\d{2})\b/i);
  }
  const policyCode = idMatch ? idMatch[1].toUpperCase() : '';

  const verMatch = cleanText.match(/Versi[oó]n\s+([0-9]+(?:\.[0-9]+)*)/i);
  const version = verMatch ? verMatch[1] : '';

  const vigMatch = cleanText.match(/(?:Fecha de vigencia del caso|Fecha de vigencia|Vigencia)\s*[:\-]?\s*([^\n|]+)/i);
  let effectiveDate = vigMatch ? vigMatch[1].trim() : '';
  if (!effectiveDate) {
    const colVig = cleanText.match(/\b2026-\d{2}-\d{2}\b/);
    if (colVig) effectiveDate = colVig[0];
  }

  const respMatch = cleanText.match(/Responsable\s*[:\-]?\s*([^\n|]+)/i);
  let owner = respMatch ? respMatch[1].trim() : '';

  if (owner) {
    for (const stopKw of ['Ámbito', 'Ambito', 'Objetivo', 'Programación', 'Concepto']) {
      if (owner.includes(stopKw)) {
        owner = owner.split(stopKw)[0].trim();
      }
    }
  }

  if (effectiveDate) {
    for (const stopKw of ['Responsable', 'Ámbito', 'Ambito', 'Objetivo']) {
      if (effectiveDate.includes(stopKw)) {
        effectiveDate = effectiveDate.split(stopKw)[0].trim();
      }
    }
  }

  return {
    policy_code: policyCode,
    title,
    version,
    effective_date: effectiveDate ? effectiveDate.slice(0, 80) : '',
    owner: owner ? owner.slice(0, 120) : '',
  };
}

export function parseXlsxAllSheets(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: false });
  const sections = [];

  for (const sheetName of wb.SheetNames || []) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    const rowLines = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const cells = row
        .map((cell) => excelSerialToIso(cell).trim())
        .filter(Boolean);
      if (cells.length > 0) {
        rowLines.push(cells.join(' | '));
      }
    }
    if (rowLines.length > 0) {
      sections.push({
        section: `Pestaña: ${sheetName}`,
        content: rowLines.join('\n'),
      });
    }
  }
  return sections;
}

function chunkByWordsAndTables(secName, textLines, maxChars = 850) {
  const chunks = [];
  let currentLines = [];
  let currentLen = 0;
  let tableHeader = null;

  for (const line of textLines) {
    const isTableRow = line.includes('|') && line.split('|').length >= 3;
    if (
      isTableRow &&
      tableHeader === null &&
      (line.includes('Concepto') || line.includes('Antigüedad') || line.includes('Fecha') || line.includes('Días'))
    ) {
      tableHeader = line;
    }

    if (currentLen + line.length + 1 > maxChars && currentLines.length > 0) {
      chunks.push({
        section: chunks.length === 0 ? secName : `${secName} (parte ${chunks.length + 1})`,
        content: currentLines.join('\n').trim(),
      });
      const lastLine = currentLines[currentLines.length - 1];
      const carry = isTableRow && tableHeader ? [tableHeader] : lastLine.length < 180 ? [lastLine] : [];
      currentLines = [...carry];
      currentLen = currentLines.reduce((acc, x) => acc + x.length + 1, 0);
    }

    if (line.length > maxChars) {
      const words = line.split(/\s+/);
      let buf = [];
      let blen = 0;
      for (const w of words) {
        if (blen + w.length + 1 > maxChars && buf.length > 0) {
          chunks.push({
            section: chunks.length === 0 ? secName : `${secName} (parte ${chunks.length + 1})`,
            content: buf.join(' '),
          });
          const overlapWords = buf.length > 15 ? buf.slice(-15) : [...buf];
          buf = overlapWords;
          blen = buf.reduce((acc, x) => acc + x.length + 1, 0);
        }
        buf.push(w);
        blen += w.length + 1;
      }
      if (buf.length > 0) {
        currentLines.push(buf.join(' '));
        currentLen += blen;
      }
    } else {
      currentLines.push(line);
      currentLen += line.length + 1;
    }
  }

  if (currentLines.length > 0) {
    chunks.push({
      section: chunks.length === 0 ? secName : `${secName} (parte ${chunks.length + 1})`,
      content: currentLines.join('\n').trim(),
    });
  }

  return chunks;
}

export function splitIntoSections(title, rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((ln) => ln.trim())
    .filter(Boolean);

  const sections = [];
  let currentSection = 'Encabezado y alcance';
  let buffer = [];
  const headingRe =
    /^(sección|seccion|artículo|articulo|##|\d+\.\s+[A-ZÁÉÍÓÚÑ]|objetivo y alcance|fundamento|reglas|procedimiento|tabla de vacaciones|escalamiento)/i;

  for (const line of lines) {
    if (headingRe.test(line) && line.length < 120) {
      if (buffer.length > 0) {
        sections.push(...chunkByWordsAndTables(currentSection, buffer));
        buffer = [];
      }
      currentSection = line.replace(/^#+\s*/, '').trim().slice(0, 160);
    } else {
      buffer.push(line);
    }
  }

  if (buffer.length > 0) {
    sections.push(...chunkByWordsAndTables(currentSection, buffer));
  }
  if (sections.length === 0) {
    sections.push({
      section: `Contenido de ${title}`,
      content: String(rawText || '').slice(0, 2000),
    });
  }
  return sections;
}

async function resolveOAuthCredentials() {
  let clientId = config.GOOGLE_OAUTH_CLIENT_ID;
  let clientSecret = config.GOOGLE_OAUTH_CLIENT_SECRET;

  try {
    const clientFile = path.resolve(config.GOOGLE_OAUTH_CLIENT_FILE);
    const raw = JSON.parse(await fs.readFile(clientFile, 'utf8'));
    const cfg = raw.web || raw.installed || {};
    clientId = clientId || cfg.client_id || '';
    clientSecret = clientSecret || cfg.client_secret || '';
  } catch {
    // Opcional si viene por env o token.json
  }
  return { clientId, clientSecret };
}

async function getDriveAuthClient() {
  const scopes = ['https://www.googleapis.com/auth/drive.readonly'];

  if (config.GOOGLE_AUTH_MODE === 'oauth2') {
    const tokenPath = path.resolve(config.GOOGLE_OAUTH_TOKEN_FILE);
    let rawToken;
    try {
      rawToken = JSON.parse(await fs.readFile(tokenPath, 'utf8'));
    } catch {
      throw new Error('Falta token.json de OAuth 2.0. Autoriza la aplicación en /api/ingestion/oauth/url primero.');
    }

    const { clientId: envClientId, clientSecret: envClientSecret } = await resolveOAuthCredentials();
    const clientId = rawToken.client_id || envClientId;
    const clientSecret = rawToken.client_secret || envClientSecret;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, config.GOOGLE_OAUTH_REDIRECT_URI);
    oauth2Client.setCredentials({
      access_token: rawToken.access_token || rawToken.token || undefined,
      refresh_token: rawToken.refresh_token || undefined,
      expiry_date: rawToken.expiry_date || (rawToken.expiry ? Date.parse(rawToken.expiry) : undefined),
    });

    oauth2Client.on('tokens', async (tokens) => {
      try {
        const merged = {
          ...rawToken,
          ...tokens,
          access_token: tokens.access_token || rawToken.access_token || rawToken.token,
          refresh_token: tokens.refresh_token || rawToken.refresh_token,
          client_id: clientId,
          client_secret: clientSecret,
          token_uri: rawToken.token_uri || 'https://oauth2.googleapis.com/token',
        };
        await fs.writeFile(tokenPath, JSON.stringify(merged, null, 2), 'utf8');
      } catch {
        // Ignorar fallo no crítico de escritura en disco
      }
    });

    return oauth2Client;
  }

  if (config.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes });
  }
  if (config.GOOGLE_SERVICE_ACCOUNT_FILE) {
    return new google.auth.GoogleAuth({ keyFile: path.resolve(config.GOOGLE_SERVICE_ACCOUNT_FILE), scopes });
  }
  throw new Error('Faltan credenciales de Google Drive en variables de entorno.');
}

async function responseToBuffer(resData) {
  if (Buffer.isBuffer(resData)) return resData;
  if (resData instanceof ArrayBuffer) return Buffer.from(resData);
  if (typeof resData === 'string') return Buffer.from(resData, 'utf8');
  if (resData && typeof resData.arrayBuffer === 'function') {
    return Buffer.from(await resData.arrayBuffer());
  }
  if (resData && typeof resData.pipe === 'function') {
    const chunks = [];
    for await (const chunk of resData) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return Buffer.from(String(resData || ''), 'utf8');
}

export async function fetchRealDriveDocuments() {
  const auth = await getDriveAuthClient();
  const drive = google.drive({ version: 'v3', auth });

  const query =
    `'${config.GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed = false and ` +
    `(mimeType = 'application/vnd.google-apps.document' or ` +
    `mimeType = 'application/vnd.google-apps.spreadsheet' or ` +
    `mimeType = 'application/pdf')`;

  const files = [];
  let pageToken = undefined;
  do {
    const res = await drive.files.list({
      q: query,
      fields: 'nextPageToken, files(id, name, mimeType, version, modifiedTime, webViewLink)',
      pageSize: 100,
      pageToken,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  const docs = [];
  for (const f of files) {
    const fileId = f.id;
    const filename = f.name;
    const mime = f.mimeType;
    const driveUrl = f.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

    let rawText = '';
    let sections = [];

    if (mime === 'application/vnd.google-apps.document') {
      const exported = await drive.files.export(
        { fileId, mimeType: 'text/plain' },
        { responseType: 'arraybuffer' }
      );
      const buf = await responseToBuffer(exported.data);
      rawText = buf.toString('utf8');
      sections = splitIntoSections(filename, rawText);
    } else if (mime === 'application/vnd.google-apps.spreadsheet') {
      const exported = await drive.files.export(
        {
          fileId,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        { responseType: 'arraybuffer' }
      );
      const buf = await responseToBuffer(exported.data);
      sections = parseXlsxAllSheets(buf);
      rawText = sections.map((s) => s.content).join('\n');
    } else if (mime === 'application/pdf') {
      const downloaded = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const buf = await responseToBuffer(downloaded.data);
      const parsed = await pdfParse(buf);
      rawText = parsed.text || '';
      sections = splitIntoSections(filename, rawText);
    }

    const meta = extractDocumentMetadata(rawText, filename);
    docs.push({
      drive_file_id: fileId,
      policy_code: meta.policy_code,
      title: meta.title,
      mime_type: mime,
      version: meta.version,
      effective_date: meta.effective_date,
      owner: meta.owner,
      drive_url: driveUrl,
      sections,
    });
  }

  return docs;
}

async function upsertAlert(prisma, driveFileId, title, alertType, severity, detail) {
  const now = new Date();
  const existing = await prisma.documentAuditAlert.findFirst({
    where: {
      driveFileId,
      alertType,
      status: { not: 'resuelta' },
    },
  });

  if (existing) {
    await prisma.documentAuditAlert.update({
      where: { id: existing.id },
      data: {
        occurrenceCount: (existing.occurrenceCount || 1) + 1,
        lastSeenAt: now,
        detail,
        title,
      },
    });
  } else {
    await prisma.documentAuditAlert.create({
      data: {
        driveFileId,
        title,
        alertType,
        severity,
        detail,
        status: 'activa',
        occurrenceCount: 1,
        resolved: false,
        lastSeenAt: now,
      },
    });
  }
}

async function resolveSyncErrorAlerts(prisma) {
  const now = new Date();
  await prisma.documentAuditAlert.updateMany({
    where: {
      alertType: 'error_sincronizacion',
      status: { not: 'resuelta' },
    },
    data: {
      status: 'resuelta',
      resolved: true,
      resolvedAt: now,
    },
  });
}

export async function syncDrivePolicies(
  prisma,
  { overrideDocs = null, forceReembed = false, deleteMissing = overrideDocs === null } = {}
) {
  if (ingestionRunning) {
    return { added: 0, updated: 0, deleted: 0, unchanged: 0, alerts: 0, skipped: true };
  }
  ingestionRunning = true;

  try {
    let sourceDocs = overrideDocs;
    if (!sourceDocs) {
      if (!config.GOOGLE_DRIVE_ENABLED || !config.GOOGLE_DRIVE_FOLDER_ID) {
        const activeCount = await prisma.driveDocument.count({ where: { status: 'activo' } });
        return { added: 0, updated: 0, deleted: 0, unchanged: activeCount, alerts: 0 };
      }

      try {
        sourceDocs = await fetchRealDriveDocuments();
        if (!sourceDocs || sourceDocs.length === 0) {
          await upsertAlert(
            prisma,
            config.GOOGLE_DRIVE_FOLDER_ID,
            'Carpeta de Google Drive vacía',
            'error_sincronizacion',
            'media',
            'No se encontraron PDFs, Google Docs ni Google Sheets en la carpeta configurada. Se conserva el último índice válido.'
          );
          const activeCount = await prisma.driveDocument.count({ where: { status: 'activo' } });
          return { added: 0, updated: 0, deleted: 0, unchanged: activeCount, alerts: 1 };
        }
        await resolveSyncErrorAlerts(prisma);
      } catch (err) {
        await upsertAlert(
          prisma,
          'drive-sync-error',
          'Error de sincronización Google Drive',
          'error_sincronizacion',
          'alta',
          `Se conservó el último índice válido. Detalle: ${err.message}`
        );
        const activeCount = await prisma.driveDocument.count({ where: { status: 'activo' } });
        return { added: 0, updated: 0, deleted: 0, unchanged: activeCount, alerts: 1 };
      }
    }

    const existingList = await prisma.driveDocument.findMany();
    const existingByDriveId = new Map(existingList.map((d) => [d.driveFileId, d]));
    const seenIds = new Set();
    const seenPolicyVersions = new Map();
    const stats = { added: 0, updated: 0, deleted: 0, unchanged: 0, alerts: 0 };
    const now = new Date();

    for (const item of sourceDocs) {
      const fid = item.drive_file_id;
      seenIds.add(fid);

      const pcode = item.policy_code || '';
      const version = item.version || '';
      const effectiveDate = item.effective_date || '';
      const owner = item.owner || '';

      const missingFields = [
        ['identificador', pcode],
        ['version', version],
        ['vigencia', effectiveDate],
        ['responsable', owner],
      ]
        .filter(([, v]) => !v)
        .map(([k]) => k);

      if (missingFields.length > 0) {
        await upsertAlert(
          prisma,
          fid,
          item.title,
          'metadato_faltante',
          'media',
          `Faltan metadatos en el contenido del documento: ${missingFields.join(', ')}.`
        );
        stats.alerts += 1;
      }

      if (pcode && version) {
        const prev = seenPolicyVersions.get(pcode);
        if (prev && prev.version !== version) {
          await upsertAlert(
            prisma,
            fid,
            item.title,
            'version_contradictoria',
            'alta',
            `Conflicto de versión para ${pcode}: ${prev.version} vs ${version}.`
          );
          stats.alerts += 1;
        } else {
          seenPolicyVersions.set(pcode, { version, fid });
        }
      }

      const serialized = JSON.stringify(item.sections || []) + `|${pcode}|${version}|${effectiveDate}|${owner}`;
      const contentHash = computeHash(serialized);
      const existing = existingByDriveId.get(fid);

      if (!forceReembed && existing && existing.contentHash === contentHash && existing.status === 'activo') {
        await prisma.driveDocument.update({
          where: { id: existing.id },
          data: { lastSyncedAt: now },
        });
        stats.unchanged += 1;
        continue;
      }

      const storedPcode = pcode || 'SIN-ID';
      const storedVer = version || 'Sin versión';
      const storedEff = effectiveDate || 'Sin vigencia';
      const storedOwner = owner || 'Sin responsable';

      const chunkPayloads = [];
      let injectionDetected = false;
      for (let idx = 0; idx < (item.sections || []).length; idx += 1) {
        const sec = item.sections[idx];
        const { cleaned, detected } = sanitizeDocumentText(sec.content);
        if (detected) {
          injectionDetected = true;
          await upsertAlert(
            prisma,
            fid,
            item.title,
            'inyeccion_detectada',
            'alta',
            `Se neutralizó un patrón de instrucción no autorizada en '${sec.section}'.`
          );
          stats.alerts += 1;
        }
        const chunkText = `${item.title} — ${sec.section}\n${cleaned}`;
        const emb = embedText(chunkText);
        if (emb.length !== (config.EMBEDDING_DIM || 384)) {
          throw new Error(`Dimensión de embedding inesperada: ${emb.length}`);
        }
        chunkPayloads.push({
          driveFileId: fid,
          policyCode: storedPcode,
          title: item.title,
          section: sec.section,
          version: storedVer,
          effectiveDate: storedEff,
          owner: storedOwner,
          driveUrl: item.drive_url,
          chunkIndex: idx,
          content: cleaned,
          embedding: emb,
        });
      }

      await prisma.$transaction(async (tx) => {
        let docRecord;
        if (!existing) {
          docRecord = await tx.driveDocument.create({
            data: {
              driveFileId: fid,
              policyCode: storedPcode,
              title: item.title,
              mimeType: item.mime_type,
              version: storedVer,
              effectiveDate: storedEff,
              owner: storedOwner,
              driveUrl: item.drive_url,
              contentHash,
              status: 'activo',
              lastSyncedAt: now,
            },
          });
          stats.added += 1;
        } else {
          docRecord = await tx.driveDocument.update({
            where: { id: existing.id },
            data: {
              policyCode: storedPcode,
              title: item.title,
              mimeType: item.mime_type,
              version: storedVer,
              effectiveDate: storedEff,
              owner: storedOwner,
              driveUrl: item.drive_url,
              contentHash,
              status: 'activo',
              lastSyncedAt: now,
            },
          });
          await tx.documentChunk.deleteMany({ where: { documentId: docRecord.id } });
          stats.updated += 1;
        }

        if (chunkPayloads.length > 0) {
          await tx.documentChunk.createMany({
            data: chunkPayloads.map((c) => ({ ...c, documentId: docRecord.id })),
          });
        }
      });

      void injectionDetected;
    }

    if (deleteMissing) {
      for (const [fid, doc] of existingByDriveId.entries()) {
        if (!seenIds.has(fid) && doc.status !== 'eliminado') {
          await prisma.$transaction(async (tx) => {
            await tx.driveDocument.update({
              where: { id: doc.id },
              data: { status: 'eliminado' },
            });
            await tx.documentChunk.deleteMany({ where: { documentId: doc.id } });
          });
          stats.deleted += 1;
        }
      }
    }

    return stats;
  } finally {
    ingestionRunning = false;
  }
}
