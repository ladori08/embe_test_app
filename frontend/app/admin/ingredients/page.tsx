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
        <AdminShell title="Ingredients">
          <Card>
            <div className="mb-3 flex justify-between">
              <p className="text-sm text-muted">Manage base inventory and stock levels.</p>
              <Button onClick={openCreate}>Add Ingredient</Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted">Loading ingredients...</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">No ingredients yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Reorder</TableHead>
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
                          Edit
                        </button>
                        <button className="text-sm text-red-600 underline" onClick={() => remove(item.id)}>
                          Delete
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
                <DialogTitle>{editing ? 'Edit ingredient' : 'Add ingredient'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <Input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                <Select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                </Select>
                <Input type="number" placeholder="Current stock" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} required />
                <Input type="number" placeholder="Reorder level" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} required />
                <Input placeholder="Cost tracking method" value={form.costTrackingMethod} onChange={e => setForm({ ...form, costTrackingMethod: e.target.value })} />
                <Button className="w-full">Save</Button>
              </form>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
