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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Ingredient, Product, Recipe } from '@/lib/types';

export default function AdminRecipesPage() {
  const [tab, setTab] = useState('list');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [error, setError] = useState('');

  const [productId, setProductId] = useState('');
  const [yieldQty, setYieldQty] = useState(1);
  const [lines, setLines] = useState([{ ingredientId: '', qtyPerBatch: 0 }]);
  const { t } = useI18n();

  const productName = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);

  const load = async () => {
    const [recipeResult, productResult, ingredientResult] = await Promise.allSettled([
      api.listRecipes(),
      api.listProductsAdmin(),
      api.listIngredients()
    ]);

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
    load();
  }, []);

  const addLine = () => setLines(prev => [...prev, { ingredientId: '', qtyPerBatch: 0 }]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!productId) {
      setError(t('admin.recipes.noProducts'));
      return;
    }
    await api.createRecipe({
      productId,
      yieldQty: Number(yieldQty),
      items: lines.filter(line => line.ingredientId).map(line => ({ ingredientId: line.ingredientId, qtyPerBatch: Number(line.qtyPerBatch) }))
    });
    setLines([{ ingredientId: '', qtyPerBatch: 0 }]);
    setYieldQty(1);
    setTab('list');
    await load();
  };

  const remove = async (id: string) => {
    await api.deleteRecipe(id);
    await load();
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
                <TabsTrigger value="create">{t('admin.recipes.tab.create')}</TabsTrigger>
              </TabsList>

              <TabsContent value="list">
                {recipes.length === 0 ? (
                  <p className="text-sm text-muted">{t('admin.recipes.empty')}</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.recipes.product')}</TableHead>
                        <TableHead>{t('admin.recipes.yield')}</TableHead>
                        <TableHead>{t('admin.recipes.ingredients')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipes.map(recipe => (
                        <TableRow key={recipe.id}>
                          <TableCell>{recipe.productName || productName.get(recipe.productId)}</TableCell>
                          <TableCell>{recipe.yieldQty}</TableCell>
                          <TableCell>{recipe.items.length}</TableCell>
                          <TableCell className="text-right">
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

              <TabsContent value="create">
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
                    <Input
                      type="number"
                      value={yieldQty}
                      onChange={e => setYieldQty(Number(e.target.value))}
                      placeholder={t('admin.recipes.yieldPerBatch')}
                    />
                  </FormField>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-muted">{t('admin.recipes.ingredients')}</p>
                    {ingredients.length === 0 ? <p className="text-sm text-muted">{t('admin.recipes.noIngredients')}</p> : null}
                    {lines.map((line, index) => (
                      <div key={index} className="grid grid-cols-[1fr_140px] gap-2">
                        <Select
                          value={line.ingredientId}
                          aria-label={`${t('admin.recipes.selectIngredient')} ${index + 1}`}
                          onChange={e =>
                            setLines(prev =>
                              prev.map((current, i) => (i === index ? { ...current, ingredientId: e.target.value } : current))
                            )
                          }
                          disabled={ingredients.length === 0}
                        >
                          <option value="">{t('admin.recipes.selectIngredient')}</option>
                          {ingredients.map(ingredient => (
                            <option key={ingredient.id} value={ingredient.id}>
                              {ingredient.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          placeholder={t('admin.recipes.qty')}
                          value={line.qtyPerBatch}
                          aria-label={`${t('admin.recipes.qty')} ${index + 1}`}
                          onChange={e =>
                            setLines(prev =>
                              prev.map((current, i) => (i === index ? { ...current, qtyPerBatch: Number(e.target.value) } : current))
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={addLine}>
                      {t('admin.recipes.addLine')}
                    </Button>
                    <Button type="submit" disabled={!productId}>
                      {t('admin.recipes.save')}
                    </Button>
                  </div>
                </form>
              </TabsContent>
            </Tabs>
          </Card>
        </AdminShell>
      </RequireRole>
    </>
  );
}
