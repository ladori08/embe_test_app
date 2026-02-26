'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { DashboardData } from '@/lib/types';
import { money } from '@/lib/utils';

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getDashboard()
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title="Dashboard">
          {loading && <Card>Loading dashboard...</Card>}
          {error && <Card className="text-red-600">{error}</Card>}
          {data && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <p className="text-sm text-muted">Total Orders</p>
                  <p className="text-2xl font-semibold">{data.totalOrders}</p>
                </Card>
                <Card>
                  <p className="text-sm text-muted">Revenue</p>
                  <p className="text-2xl font-semibold">{money(data.revenue)}</p>
                </Card>
                <Card>
                  <p className="text-sm text-muted">Estimated Profit</p>
                  <p className="text-2xl font-semibold">{money(data.estimatedProfit)}</p>
                </Card>
                <Card>
                  <p className="text-sm text-muted">Low Stock Ingredients</p>
                  <p className="text-2xl font-semibold">{data.lowStockIngredients}</p>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <h3 className="font-semibold">Order Status Mix</h3>
                  <div className="mt-3 space-y-2">
                    {data.statusBreakdown.map(item => (
                      <div key={item.status} className="flex items-center justify-between text-sm">
                        <span>{item.status}</span>
                        <span>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h3 className="font-semibold">Revenue Last 7 Days</h3>
                  <div className="mt-3 space-y-2">
                    {data.revenueLast7Days.map(point => (
                      <div key={point.day}>
                        <div className="mb-1 flex items-center justify-between text-xs text-muted">
                          <span>{point.day}</span>
                          <span>{money(point.revenue)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-[#f7ede3]">
                          <div
                            className="h-2 rounded-full bg-accent"
                            style={{ width: `${Math.min(100, point.revenue > 0 ? (point.revenue / Math.max(...data.revenueLast7Days.map(d => d.revenue), 1)) * 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}
        </AdminShell>
      </RequireRole>
    </>
  );
}
