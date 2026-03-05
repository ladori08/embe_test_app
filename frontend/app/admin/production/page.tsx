'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form';
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
    const [recipeResult, bakeResult] = await Promise.allSettled([
      api.listRecipes(),
      api.listBakes() as Promise<BakeRecord[]>
    ]);

    const loadErrors: string[] = [];

    if (recipeResult.status === 'fulfilled') {
      const recipeList = recipeResult.value;
      setRecipes(recipeList);
      setRecipeId(prev => {
        if (recipeList.length === 0) {
          return '';
        }
        if (prev && recipeList.some(recipe => recipe.id === prev)) {
          return prev;
        }
        return recipeList[0].id;
      });
    } else {
      setRecipes([]);
      setRecipeId('');
      loadErrors.push(recipeResult.reason instanceof Error ? recipeResult.reason.message : t('admin.production.failed'));
    }

    if (bakeResult.status === 'fulfilled') {
      setBakes(bakeResult.value);
    } else {
      setBakes([]);
      loadErrors.push(bakeResult.reason instanceof Error ? bakeResult.reason.message : t('admin.production.failed'));
    }

    setError(loadErrors.join(' | '));
  };

  useEffect(() => {
    load().catch(err => setError(err.message));
  }, []);

  const produce = async () => {
    setError('');
    setMessage('');
    if (!recipeId) {
      setError(t('admin.production.noRecipes'));
      return;
    }
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
            <FormField label={t('admin.production.recipe')}>
              <Select value={recipeId} onChange={e => setRecipeId(e.target.value)} disabled={recipes.length === 0}>
                {recipes.length === 0 ? <option value="">{t('admin.production.noRecipes')}</option> : null}
                {recipes.map(recipe => (
                  <option key={recipe.id} value={recipe.id}>
                    {t('admin.production.yieldLabel', { name: recipe.productName, yieldQty: recipe.yieldQty })}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('admin.production.batchFactor')}>
              <Input type="number" value={batchFactor} onChange={e => setBatchFactor(Number(e.target.value))} placeholder={t('admin.production.batchFactor')} />
            </FormField>
            <Button onClick={produce} disabled={!recipeId}>
              {t('admin.production.run')}
            </Button>
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
