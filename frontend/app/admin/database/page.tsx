'use client';

import { FormEvent, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/components/language-context';
import {
  DatabaseBackupDetail,
  DatabaseBackupFileSummary,
  DatabaseFilterCondition,
  DatabaseFilterOperator,
  DatabaseQueryRow
} from '@/lib/types';

type UiFilter = DatabaseFilterCondition & { key: string };

const OPERATORS: DatabaseFilterOperator[] = [
  'EQ',
  'NE',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'EXISTS'
];

function serializeCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export default function AdminDatabasePage() {
  const { t } = useI18n();

  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [sessionExpiresAt, setSessionExpiresAt] = useState('');

  const [collections, setCollections] = useState<{ name: string; count: number }[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [collectionFields, setCollectionFields] = useState<string[]>([]);
  const [collectionFieldsLoading, setCollectionFieldsLoading] = useState(false);

  const [filters, setFilters] = useState<UiFilter[]>([]);
  const [sortField, setSortField] = useState('');
  const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('DESC');

  const [rows, setRows] = useState<DatabaseQueryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);

  const [infoMessage, setInfoMessage] = useState('');
  const [backupRunning, setBackupRunning] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [backupListOpen, setBackupListOpen] = useState(false);
  const [backupListLoading, setBackupListLoading] = useState(false);
  const [backupList, setBackupList] = useState<DatabaseBackupFileSummary[]>([]);
  const [backupDetailOpen, setBackupDetailOpen] = useState(false);
  const [backupDetailLoading, setBackupDetailLoading] = useState(false);
  const [backupDetail, setBackupDetail] = useState<DatabaseBackupDetail | null>(null);
  const [backupError, setBackupError] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<DatabaseQueryRow | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const isUnlocked = accessToken.length > 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const columnNames = useMemo(() => {
    const fields = new Set<string>(['_id']);
    rows.forEach(row => {
      Object.keys(row.document || {}).forEach(key => fields.add(key));
    });
    return Array.from(fields);
  }, [rows]);

  const availableFields = useMemo(() => {
    const fields = new Set<string>(collectionFields);
    columnNames.forEach(field => fields.add(field));
    return Array.from(fields);
  }, [collectionFields, columnNames]);

  const toPayloadFilters = (source: UiFilter[]): DatabaseFilterCondition[] =>
    source
      .map(item => ({
        field: item.field.trim(),
        operator: item.operator,
        value: item.value
      }))
      .filter(item => item.field.length > 0);

  const handleSessionError = (err: unknown, fallbackMessage: string) => {
    const message = err instanceof Error ? err.message : fallbackMessage;
    if (err instanceof ApiError && err.status === 401) {
      setUnlockError(t('admin.database.sessionExpired'));
      setAccessToken('');
      setSessionExpiresAt('');
      setCollections([]);
      setSelectedCollection('');
      setRows([]);
      setTotal(0);
      return;
    }
    setQueryError(message);
  };

  const loadCollections = async (token: string) => {
    setCollectionsLoading(true);
    try {
      const list = await api.listDatabaseCollections(token);
      setCollections(list);
      setSelectedCollection('');
      setCollectionFields([]);
      setRows([]);
      setTotal(0);
      setPage(1);
      setQueryError('');
    } catch (err) {
      setCollections([]);
      setSelectedCollection('');
      setCollectionFields([]);
      setQueryError(err instanceof Error ? err.message : t('admin.database.collectionFailed'));
    } finally {
      setCollectionsLoading(false);
    }
  };

  const loadCollectionFields = async (token: string, collection: string) => {
    setCollectionFieldsLoading(true);
    try {
      const response = await api.listDatabaseCollectionFields(token, collection);
      setCollectionFields(response.fields || []);
    } catch (err) {
      setCollectionFields([]);
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setCollectionFieldsLoading(false);
    }
  };

  const runQuery = async (params?: {
    token?: string;
    collection?: string;
    nextPage?: number;
    nextPageSize?: number;
    nextFilters?: UiFilter[];
    nextSortField?: string;
    nextSortDirection?: 'ASC' | 'DESC';
  }) => {
    const token = params?.token ?? accessToken;
    const collection = params?.collection ?? selectedCollection;
    const targetPage = params?.nextPage ?? page;
    const targetPageSize = params?.nextPageSize ?? pageSize;
    const targetFilters = params?.nextFilters ?? filters;
    const targetSortField = params?.nextSortField ?? sortField;
    const targetSortDirection = params?.nextSortDirection ?? sortDirection;

    if (!token || !collection) {
      return;
    }

    setLoadingRows(true);
    try {
      const response = await api.queryDatabase(token, {
        collection,
        filters: toPayloadFilters(targetFilters),
        page: targetPage,
        pageSize: targetPageSize,
        sortField: targetSortField || undefined,
        sortDirection: targetSortDirection
      });
      setRows(response.rows);
      setTotal(response.total);
      setPage(response.page);
      setPageSize(response.pageSize);
      setQueryError('');
    } catch (err) {
      handleSessionError(err, t('admin.database.queryFailed'));
    } finally {
      setLoadingRows(false);
    }
  };

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    setUnlocking(true);
    setUnlockError('');
    try {
      const result = await api.unlockDatabaseConsole(unlockPassword);
      setAccessToken(result.accessToken);
      setSessionExpiresAt(result.expiresAt);
      setInfoMessage(t('admin.database.autoBackupDone', { file: result.backupFileName }));
      setUnlockPassword('');
      await loadCollections(result.accessToken);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : t('admin.database.unlockFailed'));
    } finally {
      setUnlocking(false);
    }
  };

  const addFilter = () => {
    if (availableFields.length === 0) {
      return;
    }
    setFilters(current => [
      ...current,
      {
        key: `${Date.now()}-${Math.random()}`,
        field: availableFields[0],
        operator: 'EQ',
        value: ''
      }
    ]);
  };

  const updateFilter = (key: string, patch: Partial<UiFilter>) => {
    setFilters(current => current.map(item => (item.key === key ? { ...item, ...patch } : item)));
  };

  const removeFilter = (key: string) => {
    setFilters(current => current.filter(item => item.key !== key));
  };

  const applySearch = async (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    await runQuery({ nextPage: 1 });
  };

  const resetFilters = async () => {
    const emptyFilters: UiFilter[] = [];
    setFilters(emptyFilters);
    setSortField('');
    setSortDirection('DESC');
    setPage(1);
    setQueryError('');
    await runQuery({ nextPage: 1, nextFilters: emptyFilters, nextSortField: '', nextSortDirection: 'DESC' });
  };

  const openEdit = (row: DatabaseQueryRow) => {
    setEditingRow(row);
    setEditText(JSON.stringify(row.document, null, 2));
    setEditError('');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editingRow || !selectedCollection) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText) as Record<string, unknown>;
    } catch {
      setEditError(t('admin.database.invalidJson'));
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateDatabaseDocument(accessToken, selectedCollection, editingRow.id, parsed);
      setEditOpen(false);
      await runQuery();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteRow = async (row: DatabaseQueryRow) => {
    if (!selectedCollection) return;
    const confirmed = window.confirm(t('admin.database.deleteConfirm'));
    if (!confirmed) return;
    try {
      await api.deleteDatabaseDocument(accessToken, selectedCollection, row.id);
      await runQuery();
    } catch (err) {
      handleSessionError(err, t('admin.database.queryFailed'));
    }
  };

  const runManualBackup = async () => {
    setBackupRunning(true);
    try {
      const result = await api.backupDatabase(accessToken);
      setInfoMessage(t('admin.database.backupSuccess', { file: result.fileName }));
      if (backupListOpen) {
        await loadBackupList();
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupRunning(false);
    }
  };

  const loadBackupList = async () => {
    setBackupListLoading(true);
    setBackupError('');
    try {
      const list = await api.listDatabaseBackups(accessToken);
      setBackupList(list);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupListLoading(false);
    }
  };

  const openBackupList = async () => {
    setBackupListOpen(true);
    await loadBackupList();
  };

  const openBackupDetail = async (fileName: string) => {
    setBackupDetailOpen(true);
    setBackupDetailLoading(true);
    setBackupDetail(null);
    setBackupError('');
    try {
      const detail = await api.getDatabaseBackupDetail(accessToken, fileName);
      setBackupDetail(detail);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : t('admin.database.queryFailed'));
    } finally {
      setBackupDetailLoading(false);
    }
  };

  const restoreBackup = async (fileName: string) => {
    const confirmed = window.confirm(t('admin.database.backupRestoreConfirm', { file: fileName }));
    if (!confirmed) return;
    setRestoringBackup(true);
    setBackupError('');
    try {
      const result = await api.restoreDatabaseBackup(accessToken, fileName);
      setInfoMessage(t('admin.database.backupRestoreSuccess', { file: result.restoredFromFile }));
      await runQuery({ nextPage: 1 });
      await loadBackupList();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('admin.database.queryFailed');
      setBackupError(message);
      setQueryError(message);
    } finally {
      setRestoringBackup(false);
    }
  };

  const exportData = async (format: 'csv' | 'xlsx') => {
    if (!selectedCollection) return;
    setExporting(true);
    try {
      const result = await api.exportDatabase(accessToken, format, {
        collection: selectedCollection,
        filters: toPayloadFilters(filters),
        sortField: sortField || undefined,
        sortDirection
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      handleSessionError(err, t('admin.database.queryFailed'));
    } finally {
      setExporting(false);
    }
  };

  const onCollectionChange = async (nextCollection: string) => {
    setSelectedCollection(nextCollection);
    const emptyFilters: UiFilter[] = [];
    setFilters(emptyFilters);
    setSortField('');
    setSortDirection('DESC');
    setPage(1);
    setRows([]);
    setTotal(0);
    setQueryError('');
    setCollectionFields([]);
    if (nextCollection) {
      await loadCollectionFields(accessToken, nextCollection);
      await runQuery({
        collection: nextCollection,
        nextPage: 1,
        nextFilters: emptyFilters,
        nextSortField: '',
        nextSortDirection: 'DESC'
      });
    }
  };

  return (
    <>
      <TopNav />
      <RequireRole role="SUPERADMIN">
        <AdminShell title={t('admin.nav.database')}>
          {!isUnlocked ? (
            <Card className="max-w-xl">
              <form className="space-y-3" onSubmit={unlock}>
                <div>
                  <h3 className="text-lg font-semibold">{t('admin.database.lockTitle')}</h3>
                  <p className="text-sm text-muted">{t('admin.database.lockHint')}</p>
                </div>
                <Input
                  type="password"
                  value={unlockPassword}
                  onChange={event => setUnlockPassword(event.target.value)}
                  placeholder={t('admin.database.password')}
                />
                {unlockError ? <p className="text-sm text-red-600">{unlockError}</p> : null}
                <Button type="submit" disabled={unlocking || !unlockPassword.trim()}>
                  {unlocking ? t('admin.database.unlocking') : t('admin.database.unlock')}
                </Button>
              </form>
            </Card>
          ) : (
            <div className="mx-auto w-full max-w-6xl space-y-4">
              <Card className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <span>{t('admin.database.sessionExpires', { time: new Date(sessionExpiresAt).toLocaleString() })}</span>
                </div>
                {infoMessage ? <p className="text-sm text-green-700">{infoMessage}</p> : null}
                {collectionsLoading ? <p className="text-sm text-muted">{t('admin.database.loadingCollections')}</p> : null}
                <div className="grid gap-2 md:grid-cols-[minmax(220px,300px)_1fr]">
                  <Select value={selectedCollection} onChange={event => void onCollectionChange(event.target.value)}>
                    <option value="">{t('admin.database.selectCollection')}</option>
                    {collections.map(item => (
                      <option key={item.name} value={item.name}>
                        {item.name} ({item.count})
                      </option>
                    ))}
                  </Select>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={runManualBackup} disabled={backupRunning || !selectedCollection}>
                      {backupRunning ? t('admin.database.backupRunning') : t('admin.database.manualBackup')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void openBackupList()} disabled={backupListLoading}>
                      {t('admin.database.backupList')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void exportData('csv')} disabled={exporting || !selectedCollection}>
                      {exporting ? t('admin.database.exporting') : t('admin.database.exportCsv')}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void exportData('xlsx')} disabled={exporting || !selectedCollection}>
                      {exporting ? t('admin.database.exporting') : t('admin.database.exportXlsx')}
                    </Button>
                  </div>
                </div>
              </Card>

              {selectedCollection ? (
                <>
                  <Card>
                    <form className="space-y-3" onSubmit={applySearch}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{t('admin.database.filters')}</h3>
                        <Button type="button" variant="outline" onClick={addFilter} disabled={availableFields.length === 0}>
                          {t('admin.database.addFilter')}
                        </Button>
                      </div>
                      {collectionFieldsLoading ? <p className="text-sm text-muted">{t('admin.database.loadingRows')}</p> : null}
                      {filters.length > 0 ? (
                        <div className="space-y-2">
                          {filters.map(filter => (
                            <div key={filter.key} className="grid gap-2 md:grid-cols-[1.3fr_1fr_1.3fr_auto]">
                              <Select
                                value={filter.field}
                                onChange={event => updateFilter(filter.key, { field: event.target.value })}
                              >
                                <option value="">{t('admin.database.selectField')}</option>
                                {availableFields.map(field => (
                                  <option key={field} value={field}>
                                    {field}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                value={filter.operator}
                                onChange={event => updateFilter(filter.key, { operator: event.target.value as DatabaseFilterOperator })}
                              >
                                {OPERATORS.map(operator => (
                                  <option key={operator} value={operator}>
                                    {t(`admin.database.operator.${operator}`)}
                                  </option>
                                ))}
                              </Select>
                              <Input
                                value={filter.value}
                                onChange={event => updateFilter(filter.key, { value: event.target.value })}
                                placeholder={t('admin.database.filterValue')}
                              />
                              <Button type="button" variant="outline" onClick={() => removeFilter(filter.key)}>
                                {t('common.delete')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="grid gap-2 md:grid-cols-[1fr_180px_120px_auto_auto]">
                        <Select value={sortField} onChange={event => setSortField(event.target.value)}>
                          <option value="">{t('admin.database.sortDefault')}</option>
                          {availableFields.map(field => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </Select>
                        <Select value={sortDirection} onChange={event => setSortDirection(event.target.value as 'ASC' | 'DESC')}>
                          <option value="DESC">{t('admin.database.sortDesc')}</option>
                          <option value="ASC">{t('admin.database.sortAsc')}</option>
                        </Select>
                        <Select
                          value={String(pageSize)}
                          onChange={event => {
                            const nextPageSize = Number(event.target.value) || 50;
                            setPageSize(nextPageSize);
                          }}
                        >
                          <option value="20">20</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                          <option value="200">200</option>
                        </Select>
                        <Button type="submit">{t('admin.database.search')}</Button>
                        <Button type="button" variant="outline" onClick={() => void resetFilters()}>
                          {t('admin.database.reset')}
                        </Button>
                      </div>
                    </form>
                  </Card>

                  <Card className="overflow-hidden">
                    {queryError ? <p className="mb-2 text-sm text-red-600">{queryError}</p> : null}
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
                      <span>{t('admin.database.totalRows', { count: total })}</span>
                      <span>{t('admin.database.page', { page, totalPages })}</span>
                    </div>
                    {loadingRows ? (
                      <p className="text-sm text-muted">{t('admin.database.loadingRows')}</p>
                    ) : rows.length === 0 ? (
                      <p className="text-sm text-muted">{t('admin.database.empty')}</p>
                    ) : (
                      <div className="max-h-[58vh] overflow-auto">
                        <Table className="min-w-max w-max">
                          <TableHeader className="sticky top-0 z-20 bg-white">
                            <TableRow>
                              {columnNames.map(column => (
                                <TableHead key={column} className="bg-white">
                                  {column}
                                </TableHead>
                              ))}
                              <TableHead className="bg-white">{t('admin.database.actions')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map(row => (
                              <TableRow key={row.id}>
                                {columnNames.map(column => (
                                  <TableCell key={`${row.id}-${column}`} className="align-top text-xs">
                                    <div className="max-w-[420px] whitespace-pre-wrap break-words">{serializeCell(row.document?.[column])}</div>
                                  </TableCell>
                                ))}
                                <TableCell className="align-top">
                                  <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => openEdit(row)}>
                                      {t('common.edit')}
                                    </Button>
                                    <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => void deleteRow(row)}>
                                      {t('common.delete')}
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <Button type="button" variant="outline" disabled={!canPrev || loadingRows} onClick={() => void runQuery({ nextPage: page - 1 })}>
                        {t('admin.database.prev')}
                      </Button>
                      <Button type="button" variant="outline" disabled={!canNext || loadingRows} onClick={() => void runQuery({ nextPage: page + 1 })}>
                        {t('admin.database.next')}
                      </Button>
                    </div>
                  </Card>
                </>
              ) : (
                <Card>
                  <p className="text-sm text-muted">{t('admin.database.noCollectionSelected')}</p>
                </Card>
              )}
            </div>
          )}
        </AdminShell>
      </RequireRole>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.editTitle')}</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[360px] w-full rounded-xl border border-border p-3 font-mono text-xs outline-none focus:border-accent"
            value={editText}
            onChange={event => setEditText(event.target.value)}
          />
          {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              {t('common.close')}
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? t('common.save') : t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupListOpen} onOpenChange={setBackupListOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.backupListTitle')}</DialogTitle>
          </DialogHeader>
          {backupError ? <p className="text-sm text-red-600">{backupError}</p> : null}
          {backupListLoading ? (
            <p className="text-sm text-muted">{t('admin.database.backupListLoading')}</p>
          ) : backupList.length === 0 ? (
            <p className="text-sm text-muted">{t('admin.database.backupListEmpty')}</p>
          ) : (
            <div className="max-h-[52vh] overflow-auto">
              <Table className="min-w-full">
                <TableHeader className="sticky top-0 z-20 bg-white">
                  <TableRow>
                    <TableHead className="bg-white">{t('admin.database.backupFile')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.backupCreatedAt')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.backupSize')}</TableHead>
                    <TableHead className="bg-white">{t('admin.database.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {backupList.map(item => (
                    <TableRow key={item.fileName}>
                      <TableCell className="text-xs">{item.fileName}</TableCell>
                      <TableCell>{new Date(item.createdAt).toLocaleString()}</TableCell>
                      <TableCell>{formatFileSize(item.sizeBytes)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="h-8 px-3 text-xs" onClick={() => void openBackupDetail(item.fileName)}>
                            {t('admin.database.backupViewDetail')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            disabled={restoringBackup}
                            onClick={() => void restoreBackup(item.fileName)}
                          >
                            {restoringBackup ? t('admin.database.backupRestoreRunning') : t('admin.database.backupRestore')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setBackupListOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={backupDetailOpen} onOpenChange={setBackupDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('admin.database.backupDetailTitle')}</DialogTitle>
          </DialogHeader>
          {backupDetailLoading ? (
            <p className="text-sm text-muted">{t('admin.database.backupDetailLoading')}</p>
          ) : backupDetail ? (
            <div className="space-y-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <p>
                  <strong>{t('admin.database.backupFile')}:</strong> {backupDetail.fileName}
                </p>
                <p>
                  <strong>{t('admin.database.backupCreatedAt')}:</strong> {new Date(backupDetail.createdAt).toLocaleString()}
                </p>
                <p>
                  <strong>{t('admin.database.backupTrigger')}:</strong> {backupDetail.trigger}
                </p>
                <p>
                  <strong>{t('admin.database.backupActor')}:</strong> {backupDetail.actorEmail || 'system'}
                </p>
                <p>
                  <strong>{t('admin.database.backupDatabase')}:</strong> {backupDetail.database}
                </p>
                <p>
                  <strong>{t('admin.database.backupDocuments')}:</strong> {backupDetail.totalDocuments}
                </p>
              </div>
              <div>
                <p className="mb-2 font-semibold">{t('admin.database.backupCollections')}</p>
                {backupDetail.collections.length === 0 ? (
                  <p className="text-sm text-muted">{t('admin.database.empty')}</p>
                ) : (
                  <div className="max-h-[40vh] overflow-auto">
                    <Table className="min-w-full">
                      <TableHeader className="sticky top-0 z-20 bg-white">
                        <TableRow>
                          <TableHead className="bg-white">{t('admin.database.collection')}</TableHead>
                          <TableHead className="bg-white">{t('admin.database.backupDocuments')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backupDetail.collections.map(collection => (
                          <TableRow key={collection.name}>
                            <TableCell>{collection.name}</TableCell>
                            <TableCell>{collection.count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('admin.database.empty')}</p>
          )}
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" onClick={() => setBackupDetailOpen(false)}>
              {t('common.close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
