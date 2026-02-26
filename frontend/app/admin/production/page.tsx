'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Recipe, BakeRecord } from '@/lib/types';

export default function AdminProductionPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [bakes, setBakes] = useState<BakeRecord[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [batchFactor, setBatchFactor] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { t } = useI18n();

  const load = async () => {
    const [recipeList, bakeList] = await Promise.all([api.listRecipes(), api.listBakes() as Promise<BakeRecord[]>]);
    setRecipes(recipeList);
    setBakes(bakeList);
    if (!recipeId && recipeList.length > 0) {
      setRecipeId(recipeList[0].id);
    }
  };

  useEffect(() => {
    load().catch(err => setError(err.message));
  }, []);

  const produce = async () => {
    setError('');
    setMessage('');
    try {
      const key = `bake-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api.produceBake({ recipeId, batchFactor: Number(batchFactor), idempotencyKey: key });
      setMessage(t('admin.production.success'));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.production.failed'));
    }
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.production')}>
          <Card className="space-y-3">
            <p className="text-sm text-muted">{t('admin.production.help')}</p>
            <Select value={recipeId} onChange={e => setRecipeId(e.target.value)}>
              {recipes.map(recipe => (
                <option key={recipe.id} value={recipe.id}>
                  {t('admin.production.yieldLabel', { name: recipe.productName, yieldQty: recipe.yieldQty })}
                </option>
              ))}
            </Select>
            <Input type="number" value={batchFactor} onChange={e => setBatchFactor(Number(e.target.value))} placeholder={t('admin.production.batchFactor')} />
            <Button onClick={produce}>{t('admin.production.run')}</Button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}
          </Card>

          <Card className="mt-4">
            <h3 className="mb-3 font-semibold">{t('admin.production.history')}</h3>
            {bakes.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.production.empty')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('admin.production.id')}</TableHead>
                    <TableHead>{t('admin.production.recipe')}</TableHead>
                    <TableHead>{t('admin.production.factor')}</TableHead>
                    <TableHead>{t('admin.production.produced')}</TableHead>
                    <TableHead>{t('admin.production.at')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bakes.map(bake => (
                    <TableRow key={bake.id}>
                      <TableCell>{bake.id.slice(0, 8)}...</TableCell>
                      <TableCell>{bake.recipeId}</TableCell>
                      <TableCell>{bake.factor}</TableCell>
                      <TableCell>{bake.producedQty}</TableCell>
                      <TableCell>{new Date(bake.createdAt).toLocaleString()}</TableCell>
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
