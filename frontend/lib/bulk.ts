export function normalizeHeaderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function parsePastedRows(raw: string): string[][] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const semiCount = (first.match(/;/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;

  let delimiter = '\t';
  if (tabCount === 0 && semiCount > 0) {
    delimiter = ';';
  } else if (tabCount === 0 && commaCount > 0) {
    delimiter = ',';
  }

  return lines.map(line => line.split(delimiter).map(cell => cell.trim()));
}

export function buildHeaderIndex(headerRow: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headerRow.forEach((header, i) => {
    index.set(normalizeHeaderKey(header), i);
  });
  return index;
}

export function findColumnIndex(headerIndex: Map<string, number>, aliases: string[]): number {
  for (const alias of aliases) {
    const idx = headerIndex.get(normalizeHeaderKey(alias));
    if (idx != null) {
      return idx;
    }
  }
  return -1;
}

export function parseFlexibleNumber(raw: string): number {
  const source = raw.trim().replace(/\s+/g, '');
  if (!source) {
    return 0;
  }

  let normalized = source;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaParts = normalized.split(',');
    if (commaParts.length > 2) {
      normalized = commaParts.join('');
    } else {
      normalized = normalized.replace(',', '.');
    }
  } else if (hasDot) {
    const dotParts = normalized.split('.');
    if (dotParts.length > 2) {
      normalized = dotParts.join('');
    } else if (dotParts[1] && dotParts[1].length === 3 && dotParts[0].length >= 1) {
      normalized = dotParts[0] + dotParts[1];
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
