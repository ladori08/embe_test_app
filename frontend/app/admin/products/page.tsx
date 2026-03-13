'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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
import { Product, ProductCategory, ProductLot } from '@/lib/types';

const emptyForm = { name: '', sku: '', category: '', price: 0, currentStock: 0, isActive: true, images: [] as string[], regenerateSku: false };
const ALL_CATEGORIES_FILTER = '__ALL_CATEGORIES__';

export default function AdminProductsPage() {
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryDeletingId, setCategoryDeletingId] = useState('');
  const [regeneratingSku, setRegeneratingSku] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES_FILTER);
  const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({});
  const [lotsByProduct, setLotsByProduct] = useState<Record<string, ProductLot[]>>({});
  const [lotsLoading, setLotsLoading] = useState<Record<string, boolean>>({});
  const [lotsError, setLotsError] = useState<Record<string, string>>({});
  const { t, money } = useI18n();

  const loadProducts = async () => {
    setLoading(true);
    try {
      const list = await api.listProductsAdmin();
      setItems(list);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    try {
      const list = await api.listProductCategories();
      setCategories(list);
      setCategoryError('');
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setCategoriesLoading(false);
    }
  };

  useEffect(() => {
    void Promise.all([loadProducts(), loadCategories()]);
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
    if (editing) {
      setForm(emptyForm);
    }
    setEditing(null);
    setError('');
    setOpen(true);
  };

  const openEdit = (item: Product) => {
    if (editing?.id !== item.id) {
      setForm({ ...item, regenerateSku: false });
    }
    setEditing(item);
    setError('');
    setOpen(true);
  };

  const closeProductModal = (nextOpen: boolean) => {
    setOpen(nextOpen);
  };

  const cancelProductModal = () => {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setOpen(false);
  };

  const handleCategoryChange = (value: string) => {
    setForm((prev: any) => {
      const next = { ...prev, category: value };
      if (editing && String(prev.category || '').trim() !== value) {
        next.regenerateSku = false;
      }
      return next;
    });
  };

  const regenerateSkuManually = async () => {
    if (!editing) return;
    const category = String(form.category || '').trim();
    if (!category) {
      setError(t('admin.products.categoryRequired'));
      return;
    }

    setRegeneratingSku(true);
    setError('');
    try {
      const { sku } = await api.nextProductSku(category);
      setForm((prev: any) => ({ ...prev, sku, regenerateSku: true }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate SKU');
    } finally {
      setRegeneratingSku(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!String(form.category || '').trim()) {
      setError(t('admin.products.categoryRequired'));
      return;
    }
    if (!editing && !String(form.sku || '').trim()) {
      setError(t('admin.products.skuRequired'));
      return;
    }
    const payload = {
      name: form.name,
      sku: form.sku,
      category: form.category,
      price: Number(form.price),
      currentStock: Number(form.currentStock),
      isActive: String(form.isActive) === 'true',
      images: form.images,
      regenerateSku: editing ? Boolean(form.regenerateSku) : undefined
    };
    try {
      if (editing) {
        await api.updateProduct(editing.id, payload);
      } else {
        await api.createProduct(payload);
      }
      setEditing(null);
      setForm(emptyForm);
      setError('');
      setOpen(false);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    }
  };

  const remove = async (id: string) => {
    await api.deleteProduct(id);
    await loadProducts();
  };

  const loadLots = async (productId: string) => {
    setLotsLoading(prev => ({ ...prev, [productId]: true }));
    setLotsError(prev => ({ ...prev, [productId]: '' }));
    try {
      const rows = await api.listProductLotsAdmin(productId);
      setLotsByProduct(prev => ({ ...prev, [productId]: rows }));
    } catch (err) {
      setLotsError(prev => ({
        ...prev,
        [productId]: err instanceof Error ? err.message : 'Failed to load product lots'
      }));
    } finally {
      setLotsLoading(prev => ({ ...prev, [productId]: false }));
    }
  };

  const toggleLots = (item: Product) => {
    const nextOpen = !expandedLots[item.id];
    setExpandedLots(prev => ({ ...prev, [item.id]: nextOpen }));
    if (nextOpen && lotsByProduct[item.id] === undefined && !lotsLoading[item.id]) {
      void loadLots(item.id);
    }
  };

  const openCategoryManager = () => {
    if (categoryDialogOpen) {
      return;
    }
    setCategoryDialogOpen(true);
  };

  const openCategoryEdit = (category: ProductCategory) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryError('');
  };

  const resetCategoryForm = () => {
    setEditingCategory(null);
    setCategoryName('');
  };

  const closeCategoryDialog = (nextOpen: boolean) => {
    setCategoryDialogOpen(nextOpen);
  };

  const cancelCategoryDialog = () => {
    resetCategoryForm();
    setCategoryError('');
    setCategoryDialogOpen(false);
  };

  const submitCategory = async (e: FormEvent) => {
    e.preventDefault();
    const normalizedName = categoryName.trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      setCategoryError(t('admin.products.categoryNameRequired'));
      return;
    }

    setCategorySaving(true);
    setCategoryError('');
    const editingSnapshot = editingCategory;
    try {
      const savedCategory = editingSnapshot
        ? await api.updateProductCategory(editingSnapshot.id, normalizedName)
        : await api.createProductCategory(normalizedName);

      await loadCategories();

      if (!editingSnapshot && open) {
        setForm((prev: any) => ({ ...prev, category: savedCategory.name }));
      } else if (editingSnapshot && open) {
        setForm((prev: any) => {
          const currentCategory = String(prev.category || '').trim();
          if (currentCategory.toLowerCase() !== editingSnapshot.name.toLowerCase()) {
            return prev;
          }
          return { ...prev, category: savedCategory.name, regenerateSku: false };
        });
      }

      resetCategoryForm();
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setCategorySaving(false);
    }
  };

  const deleteCategory = async (category: ProductCategory) => {
    if (!window.confirm(t('admin.products.confirmDeleteCategory'))) {
      return;
    }

    setCategoryDeletingId(category.id);
    setCategoryError('');
    try {
      await api.deleteProductCategory(category.id);
      await loadCategories();
      setForm((prev: any) => {
        const currentCategory = String(prev.category || '').trim();
        if (currentCategory.toLowerCase() !== category.name.toLowerCase()) {
          return prev;
        }
        return { ...prev, category: '', sku: editing ? prev.sku : '', regenerateSku: false };
      });
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setCategoryDeletingId('');
    }
  };

  const categoryOptions = [...categories];
  const categoryFilterOptions = useMemo(() => {
    const names = new Set<string>();
    items.forEach(item => {
      const name = String(item.category || '').trim();
      if (name) names.add(name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [items]);
  const filteredItems = useMemo(() => {
    if (categoryFilter === ALL_CATEGORIES_FILTER) return items;
    return items.filter(item => String(item.category || '').trim().toLowerCase() === categoryFilter.toLowerCase());
  }, [items, categoryFilter]);
  const selectedCategory = String(form.category || '').trim();
  const hasSelectedCategoryInList = selectedCategory
    ? categories.some(category => category.name.toLowerCase() === selectedCategory.toLowerCase())
    : false;

  return (
    <>
      <TopNav />
      <RequireRole role="ADMIN">
        <AdminShell title={t('admin.nav.products')}>
          <Card>
            <div className="mb-3 flex flex-wrap justify-between gap-2 bg-white">
              <p className="text-sm text-muted">{t('admin.products.help')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="min-w-[170px] sm:min-w-[220px]"
                  aria-label={t('admin.products.filterByCategory')}
                >
                  <option value={ALL_CATEGORIES_FILTER}>{t('admin.products.filterAllCategories')}</option>
                  {categoryFilterOptions.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
                <Button variant="outline" onClick={openCategoryManager}>
                  {t('admin.products.manageCategories')}
                </Button>
                <Button onClick={openCreate}>{t('admin.products.add')}</Button>
              </div>
            </div>
            {loading ? (
              <p className="text-sm text-muted">{t('admin.products.loading')}</p>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.products.empty')}</p>
            ) : filteredItems.length === 0 ? (
              <p className="text-sm text-muted">{t('admin.products.filterEmpty')}</p>
            ) : (
              <div className="max-h-[58vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-20 bg-white">
                    <TableRow>
                      <TableHead className="bg-white">{t('admin.products.name')}</TableHead>
                      <TableHead className="bg-white">{t('admin.products.sku')}</TableHead>
                      <TableHead className="bg-white">{t('admin.products.category')}</TableHead>
                      <TableHead className="bg-white">{t('admin.products.price')}</TableHead>
                      <TableHead className="bg-white">{t('admin.products.stock')}</TableHead>
                      <TableHead className="bg-white">{t('admin.products.status')}</TableHead>
                      <TableHead className="bg-white"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map(item => {
                      const isExpanded = !!expandedLots[item.id];
                      const lots = lotsByProduct[item.id] || [];
                      const isLotLoading = !!lotsLoading[item.id];
                      const lotLoadError = lotsError[item.id] || '';
                      return [
                        <TableRow key={item.id} className="hover:bg-[#f8f1e8]/60">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="rounded-md border border-border bg-white px-2 py-0.5 text-xs text-muted hover:bg-[#f5ede3] hover:text-ink"
                                onClick={event => {
                                  event.stopPropagation();
                                  toggleLots(item);
                                }}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                              <span>{item.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>{item.sku}</TableCell>
                          <TableCell>{item.category}</TableCell>
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
                        </TableRow>,
                        isExpanded ? (
                          <TableRow key={`${item.id}-lots`} className="bg-[#fbf7f0]">
                            <TableCell colSpan={7}>
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-muted">
                                  {t('admin.products.lotsTitle')}: {item.name} ({item.sku})
                                </p>
                                {isLotLoading ? (
                                  <p className="text-sm text-muted">{t('admin.products.lotsLoading')}</p>
                                ) : lotLoadError ? (
                                  <p className="text-sm text-red-600">{lotLoadError}</p>
                                ) : lots.length === 0 ? (
                                  <p className="text-sm text-muted">{t('admin.products.lotsEmpty')}</p>
                                ) : (
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead>{t('admin.products.lotCode')}</TableHead>
                                        <TableHead>{t('admin.products.lotProducedAt')}</TableHead>
                                        <TableHead>{t('admin.products.lotProducedQty')}</TableHead>
                                        <TableHead>{t('admin.products.lotRemainingQty')}</TableHead>
                                        <TableHead>{t('admin.products.lotUnitCost')}</TableHead>
                                        <TableHead>{t('admin.products.lotTotalCost')}</TableHead>
                                        <TableHead>{t('admin.products.lotReference')}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {lots.map(lot => (
                                        <TableRow key={lot.id}>
                                          <TableCell>{lot.lotCode}</TableCell>
                                          <TableCell>{new Date(lot.producedAt).toLocaleString()}</TableCell>
                                          <TableCell>{lot.producedQty}</TableCell>
                                          <TableCell>{lot.remainingQty}</TableCell>
                                          <TableCell>{lot.unitCost == null ? '-' : money(lot.unitCost)}</TableCell>
                                          <TableCell>{lot.totalCost == null ? '-' : money(lot.totalCost)}</TableCell>
                                          <TableCell>{lot.note || lot.bakeRecordId || '-'}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null
                      ];
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Dialog open={open} onOpenChange={closeProductModal}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? t('admin.products.edit') : t('admin.products.create')}</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-3">
                <FormField label={t('admin.products.name')}>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.category')}>
                  <div className="flex gap-2">
                    <Select value={form.category} onChange={e => handleCategoryChange(e.target.value)} required>
                      <option value="">{t('admin.products.selectCategory')}</option>
                      {categoryOptions.map(category => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                      {!hasSelectedCategoryInList && selectedCategory ? (
                        <option value={selectedCategory}>{selectedCategory}</option>
                      ) : null}
                    </Select>
                    <Button type="button" variant="outline" onClick={openCategoryManager}>
                      {t('admin.products.quickCreateCategory')}
                    </Button>
                  </div>
                  {!hasSelectedCategoryInList && selectedCategory ? (
                    <p className="text-xs text-muted">{t('admin.products.legacyCategory')}</p>
                  ) : null}
                </FormField>
                <FormField label={t('admin.products.skuLabel')}>
                  <Input value={form.sku} readOnly className="bg-[#f8f1e8] font-mono" />
                  {editing ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={regenerateSkuManually}
                        disabled={regeneratingSku || !String(form.category || '').trim()}
                      >
                        {t('admin.products.regenerateSku')}
                      </Button>
                      {form.regenerateSku ? <p className="text-xs text-muted">{t('admin.products.regeneratePending')}</p> : null}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted">{t('admin.products.skuHelp')}</p>
                </FormField>
                <FormField label={t('admin.products.price')}>
                  <Input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
                </FormField>
                <FormField label={t('admin.products.cost')}>
                  <Input value={form.cost ?? 0} readOnly className="bg-[#f8f1e8]" />
                  <p className="text-xs text-muted">{t('admin.products.costAuto')}</p>
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
                <div className="grid gap-2 sm:grid-cols-3">
                  <Button type="button" variant="ghost" onClick={() => closeProductModal(false)}>
                    {t('common.close')}
                  </Button>
                  <Button type="button" variant="outline" onClick={cancelProductModal}>
                    {t('common.cancel')}
                  </Button>
                  <Button>{t('common.save')}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={categoryDialogOpen} onOpenChange={closeCategoryDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('admin.products.categoriesTitle')}</DialogTitle>
              </DialogHeader>
              <p className="mb-3 text-sm text-muted">{t('admin.products.categoriesHelp')}</p>
              {categoryError ? <p className="mb-3 text-sm text-red-600">{categoryError}</p> : null}
              <form onSubmit={submitCategory} className="mb-4 space-y-2">
                <FormField label={t('admin.products.categoryName')}>
                  <div className="flex gap-2">
                    <Input
                      value={categoryName}
                      onChange={e => setCategoryName(e.target.value)}
                      placeholder={t('admin.products.categoryName')}
                      required
                    />
                    <Button type="submit" disabled={categorySaving}>
                      {editingCategory ? t('admin.products.updateCategory') : t('admin.products.createCategory')}
                    </Button>
                  </div>
                </FormField>
                {editingCategory ? (
                  <Button type="button" variant="ghost" onClick={resetCategoryForm}>
                    {t('admin.products.cancelCategoryEdit')}
                  </Button>
                ) : null}
              </form>
              {categoriesLoading ? (
                <p className="text-sm text-muted">{t('admin.products.categoriesLoading')}</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-muted">{t('admin.products.categoriesEmpty')}</p>
              ) : (
                <div className="max-h-72 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('admin.products.categoryName')}</TableHead>
                        <TableHead>{t('admin.products.categorySku')}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map(category => (
                        <TableRow key={category.id}>
                          <TableCell>{category.name}</TableCell>
                          <TableCell className="font-mono">{category.sku}</TableCell>
                          <TableCell className="text-right">
                            <button className="mr-3 text-sm underline" onClick={() => openCategoryEdit(category)}>
                              {t('common.edit')}
                            </button>
                            <button
                              className="text-sm text-red-600 underline disabled:opacity-50"
                              onClick={() => deleteCategory(category)}
                              disabled={categoryDeletingId === category.id}
                            >
                              {t('common.delete')}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="ghost" onClick={() => closeCategoryDialog(false)}>
                  {t('common.close')}
                </Button>
                <Button type="button" variant="outline" onClick={cancelCategoryDialog}>
                  {t('common.cancel')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </AdminShell>
      </RequireRole>
    </>
  );
}
