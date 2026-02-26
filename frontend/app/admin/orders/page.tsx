'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { Order, OrderStatus } from '@/lib/types';
import { money } from '@/lib/utils';

const statuses: OrderStatus[] = ['NEW', 'CONFIRMED', 'PAID', 'CANCELLED', 'COMPLETED'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

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
        <AdminShell title="Orders">
          <Card>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            {orders.length === 0 ? (
              <p className="text-sm text-muted">No orders available.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
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
                              {status}
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
