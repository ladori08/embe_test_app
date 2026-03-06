'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Ingredient, Product, Recipe } from '@/lib/types';
import { buildHeaderIndex, downloadTextFile, findColumnIndex, normalizeHeaderKey, parseFlexibleNumber, parsePastedRows } from '@/lib/bulk';

type RecipeLineForm = { ingredientId: string; qtyPerBatch: number };

const emptyLine = (): RecipeLineForm => ({ ingredientId: '', qtyPerBatch: 0 });

export default function AdminRecipesPage() {
  const [tab, setTab] = useState('list');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [error, setError] = useState('');

  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [productId, setProductId] = useState('');
  const [yieldQty, setYieldQty] = useState(1);
  const [lines, setLines] = useState<RecipeLineForm[]>([emptyLine()]);

  const [importOpen, setImportOpen] = useState(false);
  const [importProductId, setImportProductId] = useState('');
  const [importYieldQty, setImportYieldQty] = useState('1');
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState('');

  const { t } = useI18n();

  const productName = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);
  const ingredientById = useMemo(() => new Map(ingredients.map(ingredient => [ingredient.id, ingredient])), [ingredients]);
  const ingredientByName = useMemo(
    () => new Map(ingredients.map(ingredient => [normalizeHeaderKey(ingredient.name), ingredient])),
    [ingredients]
  );

  const load = async () => {
    const [recipeResult, productResult, ingredientResult] = await Promise.allSettled([api.listRecipes(), api.listProductsAdmin(), api.listIngredients()]);

    const loadErrors: string[] = [];

    if (recipeResult.status === 'fulfilled') {
      setRecipes(recipeResult.value);
    } else {
      setRecipes([]);
      loadErrors.push(recipeResult.reason instanceof Error ? recipeResult.reason.message : t('admin.recipes.failed'));
    }

    if (productResult.status === 'fulfilled') {
      const productList = productResult.value;
      setProducts(productList);
      setProductId(prev => {
        if (productList.length === 0) {
          return '';
        }
        if (prev && productList.some(product => product.id === prev)) {
          return prev;
        }
        return productList[0].id;
      });
    } else {
      setProducts([]);
      setProductId('');
      loadErrors.push(productResult.reason instanceof Error ? productResult.reason.message : t('admin.recipes.failed'));
    }

    if (ingredientResult.status === 'fulfilled') {
      setIngredients(ingredientResult.value);
    } else {
      setIngredients([]);
      loadErrors.push(ingredientResult.reason instanceof Error ? ingredientResult.reason.message : t('admin.recipes.failed'));
    }

    setError(loadErrors.join(' | '));
  };

  useEffect(() => {
    void load();
  }, []);

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  const resetForm = () => {
    setEditingRecipe(null);
    setYieldQty(1);
    setLines([emptyLine()]);
    setProductId(prev => {
      if (products.length === 0) {
        return '';
      }
      return products.some(product => product.id === prev) ? prev : products[0].id;
    });
  };

  const openEdit = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setProductId(recipe.productId);
    setYieldQty(Number(recipe.yieldQty));
    setLines(
      recipe.items.length > 0
        ? recipe.items.map(item => ({ ingredientId: item.ingredientId, qtyPerBatch: Number(item.qtyPerBatch) }))
        : [emptyLine()]
    );
    setTab('form');
  };

  const openBulkImport = () => {
    setImportProductId(productId || products[0]?.id || '');
    setImportYieldQty('1');
    setImportText('');
    setImportResult('');
    setImportOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productId) {
      setError(t('admin.recipes.noProducts'));
      return;
    }

    const payload = {
      productId,
      yieldQty: Number(yieldQty),
      items: lines
        .filter(line => line.ingredientId)
        .map(line => ({ ingredientId: line.ingredientId, qtyPerBatch: Number(line.qtyPerBatch) }))
    };

    if (editingRecipe) {
      await api.updateRecipe(editingRecipe.id, payload);
    } else {
      await api.createRecipe(payload);
    }

    resetForm();
    setTab('list');
    await load();
  };

  const remove = async (id: string) => {
    await api.deleteRecipe(id);
    if (editingRecipe?.id === id) {
      resetForm();
    }
    await load();
  };

  const downloadImportTemplate = () => {
    const template = ['ingredientName,qtyPerBatch', 'Flour,0.19', 'Egg,1', 'Butter,0.03'].join('\n');
    downloadTextFile('recipe-import-template.csv', template);
  };

  const runBulkImport = async () => {
    if (!importProductId) {
      setImportResult(t('admin.recipes.noProducts'));
      return;
    }

    const yieldNumber = parseFlexibleNumber(importYieldQty);
    if (!Number.isFinite(yieldNumber) || yieldNumber <= 0) {
      setImportResult(t('admin.recipes.bulkImportInvalidYield'));
      return;
    }

    setImporting(true);
    try {
      const rows = parsePastedRows(importText);
      if (rows.length === 0) {
        throw new Error(t('admin.recipes.bulkImportEmpty'));
      }

      const headerIndex = buildHeaderIndex(rows[0]);
      const detectedName = findColumnIndex(headerIndex, ['ingredientName', 'ingredient', 'name', 'ten', 'nguyenlieu']);
      const detectedQty = findColumnIndex(headerIndex, ['qtyPerBatch', 'qty', 'quantity', 'sl', 'soluong']);
      const hasHeader = detectedName >= 0 || detectedQty >= 0;

      const dataRows = hasHeader ? rows.slice(1) : rows;
      const nameIndex = hasHeader ? detectedName : 0;
      const qtyIndex = hasHeader ? detectedQty : 1;

      const aggregated = new Map<string, number>();
      const rowErrors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const lineNo = hasHeader ? i + 2 : i + 1;
        if (!row || row.every(cell => !cell.trim())) {
          continue;
        }

        const ingredientName = nameIndex >= 0 ? (row[nameIndex] || '').trim() : '';
        const qtyRaw = qtyIndex >= 0 ? (row[qtyIndex] || '').trim() : '';

        if (!ingredientName || !qtyRaw) {
          rowErrors.push(`Line ${lineNo}: missing ingredient or quantity`);
          continue;
        }

        const ingredient = ingredientByName.get(normalizeHeaderKey(ingredientName));
        if (!ingredient) {
          rowErrors.push(`Line ${lineNo}: ingredient not found "${ingredientName}"`);
          continue;
        }

        const qty = parseFlexibleNumber(qtyRaw);
        if (!Number.isFinite(qty) || qty <= 0) {
          rowErrors.push(`Line ${lineNo}: invalid quantity "${qtyRaw}"`);
          continue;
        }

        aggregated.set(ingredient.id, (aggregated.get(ingredient.id) || 0) + qty);
      }

      const items = [...aggregated.entries()].map(([ingredientId, qtyPerBatch]) => ({ ingredientId, qtyPerBatch }));
      if (items.length === 0) {
        throw new Error(t('admin.recipes.bulkImportNoValidRows'));
      }

      const payload = { productId: importProductId, yieldQty: yieldNumber, items };
      const existing = recipes.find(recipe => recipe.productId === importProductId);
      if (existing) {
        await api.updateRecipe(existing.id, payload);
      } else {
        await api.createRecipe(payload);
      }

      const previewErrors = rowErrors.slice(0, 5).join(' | ');
      setImportResult(
        `${t('admin.recipes.bulkImportResult')}: items=${items.length}${rowErrors.length ? `, skipped=${rowErrors.length}` : ''}${
          previewErrors ? ` (${previewErrors})` : ''
        }`
      );
      setImportOpen(false);
      await load();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : t('admin.recipes.failed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.recipes')}>
          <Card>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="list">{t('admin.recipes.tab.list')}</TabsTrigger>
                <TabsTrigger value="form">{editingRecipe ? t('admin.recipes.tab.edit') : t('admin.recipes.tab.create')}</TabsTrigger>
              </TabsList>
              <div className="my-3">
                <Button type="button" variant="outline" onClick={openBulkImport}>
                  {t('admin.recipes.bulkImport')}
                </Button>
              </div>

              <TabsContent value="list">
                {recipes.length === 0 ? (
                  <p className="text-sm text-muted">{t('admin.recipes.empty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.recipes.product')}</TableHead>
                        <TableHead>{t('admin.recipes.version')}</TableHead>
                        <TableHead>{t('admin.recipes.yield')}</TableHead>
                        <TableHead>{t('admin.recipes.ingredients')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipes.map(recipe => (
                        <TableRow key={recipe.id}>
                          <TableCell>{recipe.productName || productName.get(recipe.productId)}</TableCell>
                          <TableCell>v{recipe.version ?? 1}</TableCell>
                          <TableCell>{recipe.yieldQty}</TableCell>
                          <TableCell>{recipe.items.length}</TableCell>
                          <TableCell className="text-right">
                            <button className="mr-3 text-sm underline" onClick={() => openEdit(recipe)}>
                              {t('common.edit')}
                            </button>
                            <button className="text-sm text-red-600 underline" onClick={() => remove(recipe.id)}>
                              {t('common.delete')}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TabsContent>

              <TabsContent value="form">
                <form className="space-y-3" onSubmit={submit}>
                  <FormField label={t('admin.recipes.product')}>
                    <Select value={productId} onChange={e => setProductId(e.target.value)} disabled={products.length === 0}>
                      {products.length === 0 ? <option value="">{t('admin.recipes.noProducts')}</option> : null}
                      {products.map(product => (
                        <option value={product.id} key={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField label={t('admin.recipes.yieldPerBatch')}>
                    <Input type="number" value={yieldQty} onChange={e => setYieldQty(Number(e.target.value))} placeholder={t('admin.recipes.yieldPerBatch')} />
                  </FormField>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted">{t('admin.recipes.ingredients')}</p>
                    {ingredients.length === 0 ? <p className="text-sm text-muted">{t('admin.recipes.noIngredients')}</p> : null}
                    {lines.map((line, index) => {
                      const ingredient = ingredientById.get(line.ingredientId);
                      return (
                        <div key={index} className="grid grid-cols-[1fr_140px_120px] gap-2">
                          <Select
                            value={line.ingredientId}
                            aria-label={`${t('admin.recipes.selectIngredient')} ${index + 1}`}
                            onChange={e => setLines(prev => prev.map((current, i) => (i === index ? { ...current, ingredientId: e.target.value } : current)))}
                            disabled={ingredients.length === 0}
                          >
                            <option value="">{t('admin.recipes.selectIngredient')}</option>
                            {ingredients.map(currentIngredient => (
                              <option key={currentIngredient.id} value={currentIngredient.id}>
                                {currentIngredient.name}
                              </option>
                            ))}
                          </Select>
                          <Input
                            type="number"
                            placeholder={t('admin.recipes.qty')}
                            value={line.qtyPerBatch}
                            aria-label={`${t('admin.recipes.qty')} ${index + 1}`}
                            onChange={e => setLines(prev => prev.map((current, i) => (i === index ? { ...current, qtyPerBatch: Number(e.target.value) } : current)))}
                          />
                          <Input value={ingredient?.unit || ''} readOnly aria-label={`${t('admin.recipes.unit')} ${index + 1}`} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={addLine}>
                      {t('admin.recipes.addLine')}
                    </Button>
                    {editingRecipe ? (
                      <Button type="button" variant="outline" onClick={resetForm}>
                        {t('admin.recipes.cancelEdit')}
                      </Button>
                    ) : null}
                    <Button type="submit" disabled={!productId}>
                      {editingRecipe ? t('admin.recipes.update') : t('admin.recipes.save')}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </Card>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{t('admin.recipes.bulkImportTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted">{t('admin.recipes.bulkImportHint')}</p>
                <FormField label={t('admin.recipes.product')}>
                  <Select value={importProductId} onChange={e => setImportProductId(e.target.value)} disabled={products.length === 0}>
                    {products.length === 0 ? <option value="">{t('admin.recipes.noProducts')}</option> : null}
                    {products.map(product => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label={t('admin.recipes.yieldPerBatch')}>
                  <Input type="number" min="0.0001" step="0.0001" value={importYieldQty} onChange={e => setImportYieldQty(e.target.value)} />
                </FormField>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={downloadImportTemplate}>
                    {t('admin.recipes.bulkImportTemplate')}
                  </Button>
                </div>
                <FormField label={t('admin.recipes.bulkImportInput')}>
                  <textarea
                    className="min-h-56 w-full rounded-xl border border-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                  />
                </FormField>
                {importResult ? <p className="text-sm text-muted">{importResult}</p> : null}
                <Button type="button" onClick={runBulkImport} disabled={importing}>
                  {importing ? t('admin.recipes.bulkImportRunning') : t('admin.recipes.bulkImportRun')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
