'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { RequireRole } from '@/components/require-role';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  const productName = useMemo(() => new Map(products.map(p => [p.id, p.name])), [products]);

  const load = async () => {
    try {
      const [recipeList, productList, ingredientList] = await Promise.all([
        api.listRecipes(),
        api.listProductsAdmin(),
        api.listIngredients()
      ]);
      setRecipes(recipeList);
      setProducts(productList);
      setIngredients(ingredientList);
      if (!productId && productList.length > 0) setProductId(productList[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addLine = () => setLines(prev => [...prev, { ingredientId: '', qtyPerBatch: 0 }]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
        <AdminShell title="Recipes">
          <Card>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="list">Recipes</TabsTrigger>
                <TabsTrigger value="create">Create Recipe</TabsTrigger>
              </TabsList>

              <TabsContent value="list">
                {recipes.length === 0 ? (
                  <p className="text-sm text-muted">No recipes yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Yield</TableHead>
                        <TableHead>Ingredients</TableHead>
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
                              Delete
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
                  <Select value={productId} onChange={e => setProductId(e.target.value)}>
                    {products.map(product => (
                      <option value={product.id} key={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </Select>
                  <Input type="number" value={yieldQty} onChange={e => setYieldQty(Number(e.target.value))} placeholder="Yield per batch" />
                  <div className="space-y-2">
                    {lines.map((line, index) => (
                      <div key={index} className="grid grid-cols-[1fr_140px] gap-2">
                        <Select
                          value={line.ingredientId}
                          onChange={e =>
                            setLines(prev =>
                              prev.map((current, i) => (i === index ? { ...current, ingredientId: e.target.value } : current))
                            )
                          }
                        >
                          <option value="">Select ingredient</option>
                          {ingredients.map(ingredient => (
                            <option key={ingredient.id} value={ingredient.id}>
                              {ingredient.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          placeholder="Qty"
                          value={line.qtyPerBatch}
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
                      Add Ingredient Line
                    </Button>
                    <Button type="submit">Save Recipe</Button>
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
