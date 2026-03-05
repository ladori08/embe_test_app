'use client';

import { useEffect, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { BakeRecord, Recipe } from '@/lib/types';

type OverrideLine = {
  ingredientId: string;
  ingredientName: string;
  unit?: string | null;
  qtyPerBatch: number;
};

export default function AdminProductionPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [bakes, setBakes] = useState<BakeRecord[]>([]);
  const [recipeId, setRecipeId] = useState('');
  const [batchFactor, setBatchFactor] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideLines, setOverrideLines] = useState<OverrideLine[]>([]);
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const { t } = useI18n();

  const selectedRecipe = useMemo(() => recipes.find(recipe => recipe.id === recipeId) || null, [recipes, recipeId]);

  const load = async () => {
    const [recipeResult, bakeResult] = await Promise.allSettled([api.listRecipes(), api.listBakes()]);

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

  useEffect(() => {
    setOverrideEnabled(false);
    setOverrideLines([]);
  }, [recipeId]);

  const openOverrideModal = () => {
    if (!selectedRecipe) {
      setError(t('admin.production.noRecipes'));
      return;
    }
    setOverrideLines(
      selectedRecipe.items.map(item => ({
        ingredientId: item.ingredientId,
        ingredientName: item.ingredientName || item.ingredientId,
        unit: item.unit,
        qtyPerBatch: Number(item.qtyPerBatch)
      }))
    );
    setOverrideOpen(true);
  };

  const confirmOverride = () => {
    setOverrideEnabled(true);
    setOverrideOpen(false);
  };

  const clearOverride = () => {
    setOverrideEnabled(false);
    setOverrideLines([]);
  };

  const produce = async () => {
    setError('');
    setMessage('');
    if (!recipeId) {
      setError(t('admin.production.noRecipes'));
      return;
    }
    try {
      const key = `bake-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api.produceBake({
        recipeId,
        batchFactor: Number(batchFactor),
        idempotencyKey: key,
        overrideItems: overrideEnabled
          ? overrideLines.map(item => ({ ingredientId: item.ingredientId, qtyPerBatch: Number(item.qtyPerBatch) }))
          : undefined
      });
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

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={openOverrideModal} disabled={!selectedRecipe}>
                {t('admin.production.customize')}
              </Button>
              {overrideEnabled ? (
                <Button variant="outline" onClick={clearOverride}>
                  {t('admin.production.clearCustomize')}
                </Button>
              ) : null}
              <Button onClick={produce} disabled={!recipeId}>
                {t('admin.production.run')}
              </Button>
            </div>

            {overrideEnabled ? <p className="text-sm text-amber-700">{t('admin.production.customizedActive')}</p> : null}
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
                    <TableHead>{t('admin.production.version')}</TableHead>
                    <TableHead>{t('admin.production.customized')}</TableHead>
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
                      <TableCell>v{bake.recipeVersion ?? 1}</TableCell>
                      <TableCell>{bake.customOverride ? t('common.yes') : t('common.no')}</TableCell>
                      <TableCell>{bake.factor}</TableCell>
                      <TableCell>{bake.producedQty}</TableCell>
                      <TableCell>{new Date(bake.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.production.customizeTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {overrideLines.map((line, index) => (
                  <div key={line.ingredientId} className="grid grid-cols-[1fr_140px_90px] gap-2">
                    <Input value={line.ingredientName} readOnly />
                    <Input
                      type="number"
                      value={line.qtyPerBatch}
                      onChange={e =>
                        setOverrideLines(prev =>
                          prev.map((current, i) => (i === index ? { ...current, qtyPerBatch: Number(e.target.value) } : current))
                        )
                      }
                    />
                    <Input value={line.unit || ''} readOnly />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setOverrideOpen(false)}>
                  {t('common.cancel')}
                </Button>
                <Button onClick={confirmOverride}>{t('common.confirm')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
