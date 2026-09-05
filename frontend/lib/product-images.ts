import { getApiUrl } from '@/lib/api';

const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i;
const DATA_URL_PATTERN = /^data:/i;
const BLOB_URL_PATTERN = /^blob:/i;

export function resolveProductImageUrl(rawValue: string | null | undefined): string {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }
  if (ABSOLUTE_URL_PATTERN.test(value) || DATA_URL_PATTERN.test(value) || BLOB_URL_PATTERN.test(value)) {
    return value;
  }
  if (value.startsWith('/api/uploads/')) {
    return `${getApiUrl().replace(/\/$/, '')}${value}`;
  }
  return value;
}
