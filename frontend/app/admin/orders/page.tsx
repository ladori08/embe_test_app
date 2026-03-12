'use client';

import { FormEvent, useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Order, OrderStatus, OrderStatusTimelineEntry } from '@/lib/types';

function getAvailableTransitions(status: OrderStatus): OrderStatus[] {
  if (status === 'NEW') {
    return ['CONFIRMED', 'CANCELLED'];
  }
  if (status === 'CONFIRMED') {
    return ['PAID', 'CANCELLED'];
  }
  if (status === 'PAID') {
    return ['COMPLETED', 'CANCELLED'];
  }
  return [];
}

function actionLabelKey(status: OrderStatus): string {
  if (status === 'CONFIRMED') {
    return 'admin.orders.actionConfirm';
  }
  if (status === 'PAID') {
    return 'admin.orders.actionPaid';
  }
  if (status === 'COMPLETED') {
    return 'admin.orders.actionComplete';
  }
  return 'admin.orders.actionCancel';
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [timeline, setTimeline] = useState<OrderStatusTimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [error, setError] = useState('');
  const { t, money } = useI18n();

  const toFilterFromIso = (dateValue: string) => (dateValue ? new Date(`${dateValue}T00:00:00`).toISOString() : undefined);
  const toFilterToIso = (dateValue: string) => (dateValue ? new Date(`${dateValue}T23:59:59`).toISOString() : undefined);

  const formatCancelReason = (reason?: string | null) => {
    if (reason === 'MANUAL_CANCEL') {
      return t('admin.orders.cancelReasonManual');
    }
    if (reason === 'TTL_EXPIRED') {
      return t('admin.orders.cancelReasonTtlExpired');
    }
    if (!reason) {
      return t('admin.orders.cancelReasonUnknown');
    }
    return reason;
  };

  const load = (filters?: {
    status?: OrderStatus | '';
    fromDate?: string;
    toDate?: string;
  }) =>
    api
      .listOrdersAdmin({
        status: (filters?.status ?? statusFilter) || undefined,
        from: toFilterFromIso(filters?.fromDate ?? fromDate),
        to: toFilterToIso(filters?.toDate ?? toDate)
      })
      .then(list => {
        setOrders(list);
        setError('');
      })
      .catch(err => setError(err.message));

  const loadTimeline = async (orderId: string) => {
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const entries = await api.getOrderTimelineAdmin(orderId);
      setTimeline(entries);
    } catch (err) {
      setTimeline([]);
      setTimelineError(err instanceof Error ? err.message : t('admin.orders.timelineLoadFailed'));
    } finally {
      setTimelineLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateStatus = async (id: string, status: OrderStatus) => {
    try {
      const updated = await api.updateOrderStatus(id, status);
      await load();
      setSelectedOrder(prev => (prev && prev.id === id ? updated : prev));
      if (selectedOrder?.id === id) {
        await loadTimeline(id);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.orders.updateFailed'));
    }
  };

  const openDetail = (order: Order) => {
    setSelectedOrder(order);
    setTimeline([]);
    setTimelineError('');
    setDetailOpen(true);
    void loadTimeline(order.id);
  };

  const applyFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void load();
  };

  const resetFilter = () => {
    setStatusFilter('');
    setFromDate('');
    setToDate('');
    void load({ status: '', fromDate: '', toDate: '' });
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.orders')}>
          <Card>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <form className="mb-3 grid gap-2 md:grid-cols-[220px_180px_180px_120px_120px]" onSubmit={applyFilter}>
              <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | '')}>
                <option value="">{t('admin.orders.filterAllStatuses')}</option>
                <option value="NEW">{t('status.NEW')}</option>
                <option value="CONFIRMED">{t('status.CONFIRMED')}</option>
                <option value="PAID">{t('status.PAID')}</option>
                <option value="COMPLETED">{t('status.COMPLETED')}</option>
                <option value="CANCELLED">{t('status.CANCELLED')}</option>
              </Select>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} aria-label={t('admin.orders.filterFrom')} />
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} aria-label={t('admin.orders.filterTo')} />
              <Button type="submit">{t('admin.orders.filterApply')}</Button>
              <Button type="button" variant="outline" onClick={resetFilter}>
                {t('admin.orders.filterReset')}
              </Button>
            </form>
            {orders.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.orders.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.orders.order')}</TableHead>
                    <TableHead>{t('admin.orders.user')}</TableHead>
                    <TableHead>{t('admin.orders.total')}</TableHead>
                    <TableHead>{t('admin.orders.status')}</TableHead>
                    <TableHead>{t('admin.orders.actions')}</TableHead>
                    <TableHead>{t('admin.orders.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(order => (
                    <TableRow key={order.id} className="cursor-pointer hover:bg-[#f8f1e8]/60" onClick={() => openDetail(order)}>
                      <TableCell>{order.id.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <div>{order.userId ? `${order.userId.slice(0, 6)}...` : t('admin.orders.guest')}</div>
                        <div className="text-xs text-muted">
                          {order.recipientName || '-'} · {order.recipientPhone || '-'}
                        </div>
                      </TableCell>
                      <TableCell>{money(order.total)}</TableCell>
                      <TableCell>
                        <span className="text-sm">{t(`status.${order.status}`)}</span>
                        {order.status === 'CANCELLED' ? (
                          <p className="text-xs text-red-600">{formatCancelReason(order.cancelReason)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell onClick={event => event.stopPropagation()}>
                        <div className="flex flex-wrap gap-2">
                          {getAvailableTransitions(order.status).map(target => (
                            <Button
                              key={`${order.id}-${target}`}
                              type="button"
                              variant={target === 'CANCELLED' ? 'outline' : 'default'}
                              className="h-8 px-3 text-xs"
                              onClick={() => updateStatus(order.id, target)}
                            >
                              {t(actionLabelKey(target))}
                            </Button>
                          ))}
                          {getAvailableTransitions(order.status).length === 0 ? (
                            <span className="text-xs text-muted">{t('admin.orders.noActions')}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('admin.orders.detailTitle')}</DialogTitle>
              </DialogHeader>
              {selectedOrder ? (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <p>
                      <strong>{t('admin.orders.order')}:</strong> {selectedOrder.id}
                    </p>
                    <p>
                      <strong>{t('admin.orders.status')}:</strong> {t(`status.${selectedOrder.status}`)}
                    </p>
                    {selectedOrder.status === 'CANCELLED' ? (
                      <p>
                        <strong>{t('admin.orders.cancelReason')}:</strong> {formatCancelReason(selectedOrder.cancelReason)}
                      </p>
                    ) : null}
                    <p>
                      <strong>{t('admin.orders.created')}:</strong> {new Date(selectedOrder.createdAt).toLocaleString()}
                    </p>
                    {selectedOrder.holdExpiresAt ? (
                      <p>
                        <strong>{t('admin.orders.holdExpiresAt')}:</strong> {new Date(selectedOrder.holdExpiresAt).toLocaleString()}
                      </p>
                    ) : null}
                    <p>
                      <strong>{t('admin.orders.user')}:</strong>{' '}
                      {selectedOrder.userId ? `${selectedOrder.userId.slice(0, 6)}...` : t('admin.orders.guest')}
                    </p>
                    <p>
                      <strong>{t('checkout.recipientName')}:</strong> {selectedOrder.recipientName || '-'}
                    </p>
                    <p>
                      <strong>{t('checkout.recipientPhone')}:</strong> {selectedOrder.recipientPhone || '-'}
                    </p>
                    <p className="sm:col-span-2">
                      <strong>{t('checkout.deliveryAddress')}:</strong> {selectedOrder.deliveryAddress || '-'}
                    </p>
                    <p className="sm:col-span-2">
                      <strong>{t('checkout.note')}:</strong> {selectedOrder.note || '-'}
                    </p>
                  </div>

                  <div>
                    <p className="mb-2 font-semibold">{t('admin.orders.items')}</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('admin.products.name')}</TableHead>
                          <TableHead>{t('shop.quantity')}</TableHead>
                          <TableHead>{t('admin.orders.unitPrice')}</TableHead>
                          <TableHead>{t('admin.orders.lineTotal')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map(item => (
                          <TableRow key={`${selectedOrder.id}-${item.productId}`}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.qty}</TableCell>
                            <TableCell>{money(item.price)}</TableCell>
                            <TableCell>{money(item.price * item.qty)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="space-y-2 border-t border-border pt-3">
                    <p className="font-semibold">{t('admin.orders.timelineTitle')}</p>
                    {timelineLoading ? (
                      <p className="text-sm text-muted">{t('admin.orders.timelineLoading')}</p>
                    ) : timelineError ? (
                      <p className="text-sm text-red-600">{timelineError}</p>
                    ) : timeline.length === 0 ? (
                      <p className="text-sm text-muted">{t('admin.orders.timelineEmpty')}</p>
                    ) : (
                      <ol className="space-y-2">
                        {timeline.map((entry, index) => (
                          <li key={`${entry.status}-${entry.changedAt}-${index}`} className="rounded-xl border border-border bg-[#f8f1e8] px-3 py-2">
                            <p className="font-medium">{t(`status.${entry.status}`)}</p>
                            <p className="text-xs text-muted">
                              {new Date(entry.changedAt).toLocaleString()} · {entry.actorEmail || 'system'}
                            </p>
                            {entry.status === 'CANCELLED' ? (
                              <p className="text-xs text-red-700">
                                {t('admin.orders.cancelReason')}: {formatCancelReason(entry.cancelReason || selectedOrder.cancelReason)}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  <div className="space-y-1 border-t border-border pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted">{t('common.subtotal')}</span>
                      <span>{money(selectedOrder.subtotal)}</span>
                    </div>
                    {selectedOrder.tax > 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-muted">{t('checkout.tax')}</span>
                        <span>{money(selectedOrder.tax)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between text-base font-semibold">
                      <span>{t('common.total')}</span>
                      <span>{money(selectedOrder.total)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    {getAvailableTransitions(selectedOrder.status).map(target => (
                      <Button
                        key={`detail-${selectedOrder.id}-${target}`}
                        type="button"
                        variant={target === 'CANCELLED' ? 'outline' : 'default'}
                        onClick={() => updateStatus(selectedOrder.id, target)}
                      >
                        {t(actionLabelKey(target))}
                      </Button>
                    ))}
                    <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
                      {t('common.close')}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">{t('admin.orders.empty')}</p>
              )}
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
