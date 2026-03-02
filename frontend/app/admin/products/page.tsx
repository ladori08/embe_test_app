'use client';

import { FormEvent, useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';

const emptyForm = { name: '', sku: '', category: '', price: 0, cost: 0, currentStock: 0, isActive: true, images: [] as string[] };

export default function AdminProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const { t, money } = useI18n();

  const load = () =>
    api
      .listProductsAdmin()
      .then(setItems)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!open || editing) return;
    const category = String(form.category || '').trim();
    if (!category) {
      setForm((prev: any) => (prev.sku ? { ...prev, sku: '' } : prev));
      return;
    }

    const timer = window.setTimeout(() => {
      api
        .nextProductSku(category)
        .then(({ sku }) => {
          setForm((prev: any) => {
            if (String(prev.category || '').trim() !== category) {
              return prev;
            }
            return { ...prev, sku };
          });
        })
        .catch(err => setError(err.message));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, editing, form.category]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(true);
  };

  const openEdit = (item: Product) => {
    setEditing(item);
    setForm(item);
    setError('');
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing && !String(form.sku || '').trim()) {
      setError(t('admin.products.skuRequired'));
      return;
    }
    const payload = {
      ...form,
      price: Number(form.price),
      cost: Number(form.cost),
      currentStock: Number(form.currentStock),
      isActive: String(form.isActive) === 'true'
    };
    if (editing) {
      await api.updateProduct(editing.id, payload);
    } else {
      await api.createProduct(payload);
    }
    setOpen(false);
    await load();
  };

  const remove = async (id: string) => {
    await api.deleteProduct(id);
    await load();
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.products')}>
          <Card>
            <div className="mb-3 flex justify-between">
              <p className="text-sm text-muted">{t('admin.products.help')}</p>
              <Button onClick={openCreate}>{t('admin.products.add')}</Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted">{t('admin.products.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.products.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.products.name')}</TableHead>
                    <TableHead>{t('admin.products.sku')}</TableHead>
                    <TableHead>{t('admin.products.price')}</TableHead>
                    <TableHead>{t('admin.products.stock')}</TableHead>
                    <TableHead>{t('admin.products.status')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{money(item.price)}</TableCell>
                      <TableCell>{item.currentStock}</TableCell>
                      <TableCell>{item.isActive ? t('admin.products.active') : t('admin.products.hidden')}</TableCell>
                      <TableCell className="text-right">
                        <button className="mr-3 text-sm underline" onClick={() => openEdit(item)}>
                          {t('common.edit')}
                        </button>
                        <button className="text-sm text-red-600 underline" onClick={() => remove(item.id)}>
                          {t('common.delete')}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? t('admin.products.edit') : t('admin.products.create')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <FormField label={t('admin.products.name')}>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.category')}>
                  <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.skuLabel')}>
                  <Input value={form.sku} readOnly className="bg-[#f8f1e8] font-mono" />
                  <p className="text-xs text-muted">{t('admin.products.skuHelp')}</p>
                </FormField>
                <FormField label={t('admin.products.price')}>
                  <Input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.cost')}>
                  <Input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.currentStock')}>
                  <Input type="number" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.status')}>
                  <Select value={String(form.isActive)} onChange={e => setForm({ ...form, isActive: e.target.value === 'true' })}>
                    <option value="true">{t('admin.products.active')}</option>
                    <option value="false">{t('admin.products.inactive')}</option>
                  </Select>
                </FormField>
                <Button className="w-full">{t('common.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
