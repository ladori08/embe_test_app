'use client';

import { FormEvent, useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { AuditLogDetail, AuditLogListItem } from '@/lib/types';
import { useI18n } from '@/components/language-context';
import { useAuth } from '@/components/auth-context';
import { isSuperAdmin } from '@/lib/permissions';

const baseModuleOptions = ['PRODUCT', 'INGREDIENT', 'CATEGORY', 'RECIPE', 'PRODUCTION', 'ORDER'];
const actionOptions = ['CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'STOCK_ADJUST', 'PRODUCE', 'IMPORT'];

type HistoryDisplayRow = {
  path: string;
  value: string;
};

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;
type ReferenceNameIndex = Map<string, string>;
type FlattenMode = 'display' | 'raw';

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const DISPLAY_NAME_KEYS = [
  'name',
  'fullName',
  'productName',
  'ingredientName',
  'categoryName',
  'title',
  'email',
  'recipientName',
  'sku',
  'ingredientCode',
  'lotCode'
];
const PRIMARY_ENTITY_KEYS = ['name', 'productName', 'ingredientName', 'categoryName', 'fullName', 'email', 'recipientName', 'title'];

function prettifyFieldSegment(value: string): string {
  let normalized = value;
  if (normalized === 'id' || normalized === '_id') {
    normalized = 'name';
  } else if (normalized.endsWith('Id')) {
    normalized = `${normalized.slice(0, -2)}Name`;
  } else if (normalized.endsWith('_id')) {
    normalized = `${normalized.slice(0, -3)}_name`;
  }
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, char => char.toUpperCase());
}

function formatDateLike(value: string): string {
  if (!ISO_DATE_PATTERN.test(value)) {
    return value;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function isIdLikeKey(key: string): boolean {
  return key === 'id' || key === '_id' || key.endsWith('Id') || key.endsWith('_id');
}

function isLikelyIdentifier(value: string): boolean {
  const trimmed = value.trim();
  return OBJECT_ID_PATTERN.test(trimmed) || UUID_PATTERN.test(trimmed);
}

function toNameCandidateKey(idKey: string): string {
  if (idKey.endsWith('Id')) {
    return `${idKey.slice(0, -2)}Name`;
  }
  if (idKey.endsWith('_id')) {
    return `${idKey.slice(0, -3)}_name`;
  }
  return 'name';
}

function toNameCandidateKeys(idKey: string): string[] {
  if (idKey.endsWith('Id')) {
    const base = idKey.slice(0, -2);
    return [`${base}Name`, `${base}Title`, `${base}Label`];
  }
  if (idKey.endsWith('_id')) {
    const base = idKey.slice(0, -3);
    return [`${base}_name`, `${base}_title`, `${base}_label`];
  }
  return ['name', 'title', 'label'];
}

function resolveDisplayNameFromObject(source: Record<string, unknown>, idKey: string): string | null {
  const directCandidates = [toNameCandidateKey(idKey), ...toNameCandidateKeys(idKey)];
  for (const candidateKey of directCandidates) {
    const directValue = source[candidateKey];
    if (typeof directValue === 'string' && directValue.trim()) {
      return directValue.trim();
    }
  }
  for (const key of DISPLAY_NAME_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function buildReferenceNameIndex(value: unknown, index: ReferenceNameIndex = new Map()): ReferenceNameIndex {
  if (value == null) return index;

  if (Array.isArray(value)) {
    value.forEach(item => buildReferenceNameIndex(item, index));
    return index;
  }

  if (typeof value !== 'object') return index;

  const source = value as Record<string, unknown>;

  const resolvedReferences = source.resolvedReferences;
  if (resolvedReferences && typeof resolvedReferences === 'object' && !Array.isArray(resolvedReferences)) {
    for (const [rawId, rawLabel] of Object.entries(resolvedReferences as Record<string, unknown>)) {
      const id = rawId.trim();
      const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
      if (id && label) {
        index.set(id, label);
      }
    }
  }

  const stringEntries = Object.entries(source).filter(([, entryValue]) => typeof entryValue === 'string');
  for (const [key, rawIdValue] of stringEntries) {
    if (!isIdLikeKey(key)) continue;
    const idValue = String(rawIdValue).trim();
    if (!idValue) continue;
    const displayName = resolveDisplayNameFromObject(source, key);
    if (displayName) {
      index.set(idValue, displayName);
    }
  }

  Object.values(source).forEach(nested => buildReferenceNameIndex(nested, index));
  return index;
}

function formatScalarValue(value: unknown, referenceNameIndex: ReferenceNameIndex, mode: FlattenMode): string {
  if (value == null) return '-';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '-';
    if (mode === 'raw') return trimmed;
    const mappedName = referenceNameIndex.get(trimmed);
    if (mappedName) return mappedName;
    if (isLikelyIdentifier(trimmed)) return '-';
    return formatDateLike(trimmed);
  }
  if (mode === 'raw') {
    return String(value);
  }
  if (typeof value === 'number') {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

function flattenHistoryValue(value: unknown, parentPath = '', referenceNameIndex?: ReferenceNameIndex, mode: FlattenMode = 'display'): HistoryDisplayRow[] {
  const index = referenceNameIndex ?? buildReferenceNameIndex(value);
  if (value == null) {
    return parentPath ? [{ path: parentPath, value: '-' }] : [];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return parentPath ? [{ path: parentPath, value: '-' }] : [];
    }
    const primitiveOnly = value.every(item => item == null || ['string', 'number', 'boolean'].includes(typeof item));
    if (primitiveOnly) {
      return [{ path: parentPath || 'value', value: value.map(item => formatScalarValue(item, index, mode)).join(', ') }];
    }
    return value.flatMap((item, itemIndex) => flattenHistoryValue(item, `${parentPath}[${itemIndex + 1}]`, index, mode));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return parentPath ? [{ path: parentPath, value: '-' }] : [];
    }
    return entries.flatMap(([key, nested]) => {
      const nextPath = parentPath ? `${parentPath}.${key}` : key;
      if (isIdLikeKey(key)) {
        if (mode === 'raw') {
          return [{ path: nextPath, value: nested == null ? '-' : String(nested).trim() || '-' }];
        }
        const displayName = nested == null ? null : index.get(String(nested).trim());
        if (displayName) {
          return [{ path: nextPath, value: displayName }];
        }
        if (nested == null) {
          return [];
        }
        const rawValue = String(nested).trim();
        return rawValue ? [{ path: nextPath, value: rawValue }] : [];
      }
      return flattenHistoryValue(nested, nextPath, index, mode);
    });
  }

  return [{ path: parentPath || 'value', value: formatScalarValue(value, index, mode) }];
}

function formatPathLabel(path: string): string {
  if (!path) return 'Value';
  return path
    .replace(/\[(\d+)]/g, '.item $1')
    .split('.')
    .filter(Boolean)
    .map(prettifyFieldSegment)
    .join(' > ');
}

function resolvePrimaryEntityLabel(detail: AuditLogDetail): string {
  const fromMetadata = detail.metadata && typeof detail.metadata === 'object' ? (detail.metadata as Record<string, unknown>) : null;
  if (fromMetadata) {
    for (const key of ['sourceDocumentTitle', 'replacementDocumentTitle', 'targetDocumentTitle']) {
      const value = fromMetadata[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  const root = detail.afterData ?? detail.beforeData;
  if (!root || typeof root !== 'object') {
    if (typeof detail.title === 'string') {
      const title = detail.title.trim();
      const colonIndex = title.indexOf(':');
      if (colonIndex >= 0) {
        const candidate = title.slice(colonIndex + 1).trim();
        if (candidate && candidate.toLowerCase() !== 'record') {
          return candidate;
        }
      }
    }
    return '-';
  }
  const source = root as Record<string, unknown>;
  for (const key of PRIMARY_ENTITY_KEYS) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  const items = source.items;
  if (Array.isArray(items) && items.length > 0) {
    const names = items
      .map(item => (typeof item === 'object' && item != null ? (item as Record<string, unknown>).name : null))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim());
    if (names.length > 0) {
      const uniqueNames = Array.from(new Set(names));
      const preview = uniqueNames.slice(0, 2).join(', ');
      return uniqueNames.length > 2 ? `${preview} +${uniqueNames.length - 2}` : preview;
    }
  }
  return '-';
}

function buildDetailReferenceNameIndex(detail: AuditLogDetail): ReferenceNameIndex {
  const index: ReferenceNameIndex = new Map();
  buildReferenceNameIndex(detail.beforeData, index);
  buildReferenceNameIndex(detail.afterData, index);
  buildReferenceNameIndex(detail.metadata, index);
  return index;
}

function changeActionSummaryText(action: string, t: TranslateFn): string {
  switch (action) {
    case 'CREATE':
      return t('admin.history.changeActionCreate');
    case 'UPDATE':
      return t('admin.history.changeActionUpdate');
    case 'DELETE':
      return t('admin.history.changeActionDelete');
    case 'STATUS_CHANGE':
      return t('admin.history.changeActionStatusChange');
    case 'STOCK_ADJUST':
      return t('admin.history.changeActionStockAdjust');
    case 'PRODUCE':
      return t('admin.history.changeActionProduce');
    case 'IMPORT':
      return t('admin.history.changeActionImport');
    default:
      return t('admin.history.changeActionDefault');
  }
}

function buildChangeSummaryRows(detail: AuditLogDetail, t: TranslateFn, referenceNameIndex: ReferenceNameIndex): HistoryDisplayRow[] {
  const beforeRawMap = new Map(flattenHistoryValue(detail.beforeData, '', referenceNameIndex, 'raw').map(row => [row.path, row.value]));
  const afterRawMap = new Map(flattenHistoryValue(detail.afterData, '', referenceNameIndex, 'raw').map(row => [row.path, row.value]));
  const beforeDisplayMap = new Map(flattenHistoryValue(detail.beforeData, '', referenceNameIndex, 'display').map(row => [row.path, row.value]));
  const afterDisplayMap = new Map(flattenHistoryValue(detail.afterData, '', referenceNameIndex, 'display').map(row => [row.path, row.value]));
  const keys = Array.from(new Set([...beforeRawMap.keys(), ...afterRawMap.keys()])).sort((a, b) => a.localeCompare(b));

  const changes: HistoryDisplayRow[] = [];
  for (const key of keys) {
    const beforeRaw = beforeRawMap.get(key);
    const afterRaw = afterRawMap.get(key);
    if (beforeRaw === afterRaw) continue;

    const beforeValue = beforeDisplayMap.get(key) ?? beforeRaw ?? '-';
    const afterValue = afterDisplayMap.get(key) ?? afterRaw ?? '-';

    if (beforeValue == null && afterValue != null) {
      changes.push({
        path: formatPathLabel(key),
        value: t('admin.history.changeAdded', { value: afterValue })
      });
      continue;
    }

    if (beforeValue != null && afterValue == null) {
      changes.push({
        path: formatPathLabel(key),
        value: t('admin.history.changeRemoved', { value: beforeValue })
      });
      continue;
    }

    changes.push({
      path: formatPathLabel(key),
      value: t('admin.history.changeUpdated', { before: beforeValue ?? '-', after: afterValue ?? '-' })
    });
  }

  const summaryRows: HistoryDisplayRow[] = [
    { path: t('admin.history.changeSummaryType'), value: changeActionSummaryText(detail.action, t) },
    { path: t('admin.history.module'), value: detail.module || '-' },
    { path: t('admin.history.changeSummaryEntity'), value: resolvePrimaryEntityLabel(detail) },
    { path: t('admin.history.changeSummaryAffectedFields'), value: String(changes.length) }
  ];

  if (changes.length === 0) {
    summaryRows.push({ path: t('admin.history.changeSummaryNote'), value: t('admin.history.changeSummaryEmpty') });
    return summaryRows;
  }

  return [...summaryRows, ...changes];
}

export default function AdminHistoryPage() {
  const [logs, setLogs] = useState<AuditLogListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [moduleFilter, setModuleFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [query, setQuery] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AuditLogDetail | null>(null);

  const { t } = useI18n();
  const { user } = useAuth();
  const canViewUserHistory = isSuperAdmin(user);
  const moduleOptions = canViewUserHistory ? [...baseModuleOptions, 'USER'] : baseModuleOptions;
  const detailReferenceNameIndex = detail ? buildDetailReferenceNameIndex(detail) : undefined;

  const load = async (filters?: { module?: string; action?: string; query?: string }) => {
    setLoading(true);
    try {
      const list = await api.listAuditLogs({
        module: (filters?.module ?? moduleFilter) || undefined,
        action: (filters?.action ?? actionFilter) || undefined,
        q: (filters?.query ?? query).trim() || undefined,
        limit: 300
      });
      setLogs(list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.history.failed'));
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const applyFilter = async (e: FormEvent) => {
    e.preventDefault();
    await load();
  };

  const resetFilter = async () => {
    setModuleFilter('');
    setActionFilter('');
    setQuery('');
    await load({ module: '', action: '', query: '' });
  };

  const openDetail = async (id: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const data = await api.getAuditLog(id);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.history.failed'));
    } finally {
      setDetailLoading(false);
    }
  };

  const renderHistoryRowsBlock = (label: string, rows: HistoryDisplayRow[], formatPath = true) => {
    return (
      <div>
        <p className="mb-1 font-semibold">{label}</p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted">{t('admin.history.emptyData')}</p>
        ) : (
          <div className="max-h-52 overflow-auto rounded-lg border border-border bg-[#f8f1e8]">
            <Table className="min-w-full">
              <TableHeader className="sticky top-0 z-20 bg-[#f8f1e8]">
                <TableRow>
                  <TableHead className="w-[38%] bg-[#f8f1e8] text-xs">{t('admin.history.field')}</TableHead>
                  <TableHead className="bg-[#f8f1e8] text-xs">{t('admin.history.value')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={`${label}-${row.path}-${index}`}>
                    <TableCell className="align-top text-xs font-semibold">{formatPath ? formatPathLabel(row.path) : row.path}</TableCell>
                    <TableCell className="align-top text-xs">
                      <div className="whitespace-pre-wrap break-words">{row.value}</div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  const renderHistoryDataBlock = (label: string, value: unknown, referenceNameIndex?: ReferenceNameIndex) => {
    return renderHistoryRowsBlock(label, flattenHistoryValue(value, '', referenceNameIndex, 'display'));
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.history')}>
          <Card>
            <form className="mb-3 grid gap-2 md:grid-cols-[200px_220px_1fr_120px_120px]" onSubmit={applyFilter}>
              <Select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}>
                <option value="">{t('admin.history.allModules')}</option>
                {moduleOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                <option value="">{t('admin.history.allActions')}</option>
                {actionOptions.map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('admin.history.searchPlaceholder')} />
              <Button type="submit">{t('admin.history.search')}</Button>
              <Button type="button" variant="outline" onClick={() => void resetFilter()}>
                {t('admin.history.filterReset')}
              </Button>
            </form>

            {loading ? (
              <p className="text-sm text-muted">{t('admin.history.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.history.empty')}</p>
            ) : (
              <div className="max-h-[58vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-white">
                    <TableRow>
                      <TableHead className="bg-white">{t('admin.history.title')}</TableHead>
                      <TableHead className="bg-white">{t('admin.history.module')}</TableHead>
                      <TableHead className="bg-white">{t('admin.history.action')}</TableHead>
                      <TableHead className="bg-white">{t('admin.history.actor')}</TableHead>
                      <TableHead className="bg-white">{t('admin.history.time')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id} className="cursor-pointer hover:bg-[#f8f1e8]/60" onClick={() => openDetail(log.id)}>
                        <TableCell>{log.title}</TableCell>
                        <TableCell>{log.module}</TableCell>
                        <TableCell>{log.action}</TableCell>
                        <TableCell>{log.actorEmail || 'system'}</TableCell>
                        <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto p-0">
              <div className="sticky top-0 z-30 border-b border-border bg-white px-6 pb-4 pt-5">
                <DialogHeader className="space-y-2">
                  <DialogTitle>{t('admin.history.detailTitle')}</DialogTitle>
                  {detail ? (
                    <p className="text-sm">
                      <strong>{t('admin.history.title')}:</strong> {detail.title}
                    </p>
                  ) : null}
                </DialogHeader>
              </div>
              {detailLoading ? (
                <div className="px-6 py-4">
                  <p className="text-sm text-muted">{t('admin.history.loading')}</p>
                </div>
              ) : detail ? (
                <div className="space-y-3 px-6 py-4 text-sm">
                  <p>
                    <strong>{t('admin.history.module')}:</strong> {detail.module}
                  </p>
                  <p>
                    <strong>{t('admin.history.action')}:</strong> {detail.action}
                  </p>
                  <p>
                    <strong>{t('admin.history.actor')}:</strong> {detail.actorEmail || 'system'}
                  </p>
                  <p>
                    <strong>{t('admin.history.time')}:</strong> {new Date(detail.createdAt).toLocaleString()}
                  </p>
                  {renderHistoryRowsBlock(
                    t('admin.history.changeSummary'),
                    buildChangeSummaryRows(detail, t, detailReferenceNameIndex ?? new Map()),
                    false
                  )}
                  {renderHistoryDataBlock(t('admin.history.before'), detail.beforeData, detailReferenceNameIndex)}
                  {renderHistoryDataBlock(t('admin.history.after'), detail.afterData, detailReferenceNameIndex)}
                  {renderHistoryDataBlock(t('admin.history.metadata'), detail.metadata, detailReferenceNameIndex)}
                </div>
              ) : (
                <div className="px-6 py-4">
                  <p className="text-sm text-muted">{t('admin.history.empty')}</p>
                </div>
              )}
              <div className="flex justify-end border-t border-border bg-white px-6 py-4">
                <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
                  {t('common.close')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
