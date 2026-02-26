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
import { Select } from '@/components/ui/select';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Ingredient } from '@/lib/types';

const emptyForm = { name: '', unit: 'g', currentStock: 0, reorderLevel: 0, costTrackingMethod: 'AVG_BIN' };

export default function AdminIngredientsPage() {
  const [items, setItems] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const { t } = useI18n();

  const load = () =>
    api
      .listIngredients()
      .then(setItems)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (item: Ingredient) => {
    setEditing(item);
    setForm(item);
    setOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      currentStock: Number(form.currentStock),
      reorderLevel: Number(form.reorderLevel)
    };
    if (editing) {
      await api.updateIngredient(editing.id, payload);
    } else {
      await api.createIngredient(payload);
    }
    setOpen(false);
    await load();
  };

  const remove = async (id: string) => {
    await api.deleteIngredient(id);
    await load();
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.ingredients')}>
          <Card>
            <div className="mb-3 flex justify-between">
              <p className="text-sm text-muted">{t('admin.ingredients.help')}</p>
              <Button onClick={openCreate}>{t('admin.ingredients.add')}</Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted">{t('admin.ingredients.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.ingredients.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.ingredients.name')}</TableHead>
                    <TableHead>{t('admin.ingredients.unit')}</TableHead>
                    <TableHead>{t('admin.ingredients.stock')}</TableHead>
                    <TableHead>{t('admin.ingredients.reorder')}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{item.currentStock}</TableCell>
                      <TableCell>{item.reorderLevel}</TableCell>
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
                <DialogTitle>{editing ? t('admin.ingredients.edit') : t('admin.ingredients.create')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <Input placeholder={t('admin.ingredients.name')} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                <Select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                </Select>
                <Input type="number" placeholder={t('admin.ingredients.currentStock')} value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} required />
                <Input type="number" placeholder={t('admin.ingredients.reorderLevel')} value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} required />
                <Input placeholder={t('admin.ingredients.costTracking')} value={form.costTrackingMethod} onChange={e => setForm({ ...form, costTrackingMethod: e.target.value })} />
                <Button className="w-full">{t('common.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
