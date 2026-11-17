import React from 'react';

function renderInline(text, keyPrefix) {
  const parts = [];
  const tokenRe = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;
  let match;
  let k = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={`${keyPrefix}-b-${k++}`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}-c-${k++}`}
          style={{ background: 'var(--bg-subtle)', padding: '0.1rem 0.35rem', borderRadius: 4, fontSize: '0.85em' }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIdx = tokenRe.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts;
}

function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 3;
}

function isSeparatorRow(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function parseCells(line) {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((c) => c.trim());
}

export default function MarkdownText({ content }) {
  if (!content) return null;

  const lines = String(content).split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Tabla Markdown
    if (isTableRow(trimmed)) {
      const tableLines = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i += 1;
      }
      const header = parseCells(tableLines[0]);
      const dataStart = tableLines.length > 1 && isSeparatorRow(tableLines[1]) ? 2 : 1;
      const bodyRows = tableLines.slice(dataStart).map(parseCells);

      blocks.push(
        <div key={`tbl-${i}`} className="table-scroll" style={{ margin: '0.5rem 0' }}>
          <table style={{ minWidth: 'unset', fontSize: '0.84rem' }}>
            <thead>
              <tr>
                {header.map((h, idx) => (
                  <th key={`th-${idx}`}>{renderInline(h, `th-${i}-${idx}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={`tr-${rIdx}`}>
                  {row.map((cell, cIdx) => (
                    <td key={`td-${cIdx}`}>{renderInline(cell, `td-${i}-${rIdx}-${cIdx}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Encabezados
    if (/^#{1,3}\s+/.test(trimmed)) {
      const text = trimmed.replace(/^#{1,3}\s+/, '');
      blocks.push(
        <div key={`h-${i}`} style={{ fontWeight: 700, fontSize: '0.98rem', margin: '0.5rem 0 0.25rem', color: 'var(--text-primary)' }}>
          {renderInline(text, `h-${i}`)}
        </div>
      );
      i += 1;
      continue;
    }

    // Lista con viñetas
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${i}`} style={{ margin: '0.35rem 0', paddingLeft: '1.25rem' }}>
          {items.map((it, idx) => (
            <li key={`li-${idx}`} style={{ marginBottom: '0.2rem' }}>
              {renderInline(it, `ul-${i}-${idx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Lista numerada
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${i}`} style={{ margin: '0.35rem 0', paddingLeft: '1.25rem' }}>
          {items.map((it, idx) => (
            <li key={`oli-${idx}`} style={{ marginBottom: '0.2rem' }}>
              {renderInline(it, `ol-${i}-${idx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Párrafo estándar
    blocks.push(
      <p key={`p-${i}`} style={{ margin: '0.35rem 0' }}>
        {renderInline(trimmed, `p-${i}`)}
      </p>
    );
    i += 1;
  }

  return <div>{blocks}</div>;
}
