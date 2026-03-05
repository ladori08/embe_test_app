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

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listAuditLogs({
        module: moduleFilter || undefined,
        action: actionFilter || undefined,
        q: query.trim() || undefined,
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

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.history')}>
          <Card>
            <form className="mb-3 grid gap-2 md:grid-cols-[200px_220px_1fr_120px]" onSubmit={applyFilter}>
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
            </form>

            {loading ? (
              <p className="text-sm text-muted">{t('admin.history.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.history.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.history.title')}</TableHead>
                    <TableHead>{t('admin.history.module')}</TableHead>
                    <TableHead>{t('admin.history.action')}</TableHead>
                    <TableHead>{t('admin.history.actor')}</TableHead>
                    <TableHead>{t('admin.history.time')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <button className="text-left text-sm underline" onClick={() => openDetail(log.id)}>
                          {log.title}
                        </button>
                      </TableCell>
                      <TableCell>{log.module}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell>{log.actorEmail || 'system'}</TableCell>
                      <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('admin.history.detailTitle')}</DialogTitle>
              </DialogHeader>
              {detailLoading ? (
                <p className="text-sm text-muted">{t('admin.history.loading')}</p>
              ) : detail ? (
                <div className="space-y-3 text-sm">
                  <p>
                    <strong>{t('admin.history.title')}:</strong> {detail.title}
                  </p>
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
                  <div>
                    <p className="mb-1 font-semibold">{t('admin.history.before')}</p>
                    <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-[#f8f1e8] p-2 text-xs">{JSON.stringify(detail.beforeData || {}, null, 2)}</pre>
                  </div>
                  <div>
                    <p className="mb-1 font-semibold">{t('admin.history.after')}</p>
                    <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-[#f8f1e8] p-2 text-xs">{JSON.stringify(detail.afterData || {}, null, 2)}</pre>
                  </div>
                  <div>
                    <p className="mb-1 font-semibold">{t('admin.history.metadata')}</p>
                    <pre className="max-h-52 overflow-auto rounded-lg border border-border bg-[#f8f1e8] p-2 text-xs">{JSON.stringify(detail.metadata || {}, null, 2)}</pre>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">{t('admin.history.empty')}</p>
              )}
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
