'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Order, OrderStatus } from '@/lib/types';

const statuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'PAID', 'CANCELLED', 'COMPLETED'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');
  const { t, money } = useI18n();

  const load = () =>
    api
      .listOrdersAdmin()
      .then(setOrders)
      .catch(err => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: OrderStatus) => {
    await api.updateOrderStatus(id, status);
    await load();
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.orders')}>
          <Card>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
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
                    <TableHead>{t('admin.orders.created')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell>{order.id.slice(0, 8)}...</TableCell>
                      <TableCell>{order.userId.slice(0, 6)}...</TableCell>
                      <TableCell>{money(order.total)}</TableCell>
                      <TableCell>
                        <Select value={order.status} onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}>
                          {statuses.map(status => (
                            <option value={status} key={status}>
                              {t(`status.${status}`)}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell>{new Date(order.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </AdminShell>
      </RequireRole>
    </>
  );
}
