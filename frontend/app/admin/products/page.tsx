'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { resolveProductImageUrl } from '@/lib/product-images';
import { Product, ProductCategory, ProductLot } from '@/lib/types';

const emptyForm = { name: '', sku: '', category: '', price: 0, currentStock: 0, isActive: true, images: [] as string[], regenerateSku: false };
const ALL_CATEGORIES_FILTER = '__ALL_CATEGORIES__';
const MAX_IMAGE_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_MB = 25;
const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif', 'jfif']);
const PRODUCT_THUMBNAIL_ASPECT_RATIO = 16 / 9;
const PRODUCT_THUMBNAIL_OUTPUT_WIDTH = 1600;
const PRODUCT_THUMBNAIL_OUTPUT_HEIGHT = Math.round(PRODUCT_THUMBNAIL_OUTPUT_WIDTH / PRODUCT_THUMBNAIL_ASPECT_RATIO);

type ImageCropOptions = {
  xPercent: number;
  yPercent: number;
  zoom: number;
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
};

const mergeImageUrls = (existing: string[], appended: string[]) => {
  const merged = [...existing, ...appended].map(item => item.trim()).filter(Boolean);
  return Array.from(new Set(merged));
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('Failed to read image'));
    };
    image.src = imageUrl;
  });

const buildCroppedFileName = (name: string, extension: string) => {
  const clean = String(name || 'product-image').trim();
  const dotIndex = clean.lastIndexOf('.');
  const baseName = dotIndex > 0 ? clean.slice(0, dotIndex) : clean;
  return `${baseName}-cropped.${extension}`;
};

const cropImageFile = async (file: File, options: ImageCropOptions): Promise<File> => {
  const image = await loadImageFromFile(file);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  if (!imageWidth || !imageHeight) {
    throw new Error('Image has invalid dimensions');
  }

  let baseCropWidth: number;
  let baseCropHeight: number;
  if (imageWidth / imageHeight > options.aspectRatio) {
    baseCropHeight = imageHeight;
    baseCropWidth = imageHeight * options.aspectRatio;
  } else {
    baseCropWidth = imageWidth;
    baseCropHeight = imageWidth / options.aspectRatio;
  }

  const zoom = Math.max(1, options.zoom);
  const cropWidth = baseCropWidth / zoom;
  const cropHeight = baseCropHeight / zoom;
  const centerX = (Math.max(0, Math.min(100, options.xPercent)) / 100) * imageWidth;
  const centerY = (Math.max(0, Math.min(100, options.yPercent)) / 100) * imageHeight;
  const maxCropX = Math.max(0, imageWidth - cropWidth);
  const maxCropY = Math.max(0, imageHeight - cropHeight);
  const cropX = Math.max(0, Math.min(maxCropX, centerX - cropWidth / 2));
  const cropY = Math.max(0, Math.min(maxCropY, centerY - cropHeight / 2));

  const canvas = document.createElement('canvas');
  canvas.width = options.outputWidth;
  canvas.height = options.outputHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }
  context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, options.outputWidth, options.outputHeight);

  const preferredType =
    file.type === 'image/png'
      ? 'image/png'
      : file.type === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg';
  const extension = preferredType === 'image/png' ? 'png' : preferredType === 'image/webp' ? 'webp' : 'jpg';
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, preferredType, 0.92));
  if (!blob) {
    throw new Error('Failed to export cropped image');
  }
  return new File([blob], buildCroppedFileName(file.name, extension), {
    type: preferredType,
    lastModified: Date.now()
  });
};

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
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState('');
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropProcessing, setCropProcessing] = useState(false);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState('');
  const [cropPendingFiles, setCropPendingFiles] = useState<File[]>([]);
  const [cropValidationErrors, setCropValidationErrors] = useState<string[]>([]);
  const [cropXPercent, setCropXPercent] = useState(50);
  const [cropYPercent, setCropYPercent] = useState(50);
  const [cropZoom, setCropZoom] = useState(1);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(
    () => () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    },
    [cropSourceUrl]
  );

  const resetCropState = () => {
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }
    setCropDialogOpen(false);
    setCropProcessing(false);
    setCropSourceFile(null);
    setCropSourceUrl('');
    setCropPendingFiles([]);
    setCropValidationErrors([]);
    setCropXPercent(50);
    setCropYPercent(50);
    setCropZoom(1);
  };

  const openCropDialogForImages = (files: File[], validationErrors: string[]) => {
    if (files.length === 0) {
      setImageUploadError(validationErrors.join('\n'));
      return;
    }
    if (cropSourceUrl) {
      URL.revokeObjectURL(cropSourceUrl);
    }
    const [firstFile, ...remaining] = files;
    setCropSourceFile(firstFile);
    setCropSourceUrl(URL.createObjectURL(firstFile));
    setCropPendingFiles(remaining);
    setCropValidationErrors(validationErrors);
    setCropXPercent(50);
    setCropYPercent(50);
    setCropZoom(1);
    setCropProcessing(false);
    setCropDialogOpen(true);
  };

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
    resetCropState();
    setEditing(null);
    setError('');
    setImageUploadError('');
    setOpen(true);
  };

  const openEdit = (item: Product) => {
    if (editing?.id !== item.id) {
      setForm({ ...item, images: Array.isArray(item.images) ? item.images : [], regenerateSku: false });
    }
    resetCropState();
    setEditing(item);
    setError('');
    setImageUploadError('');
    setOpen(true);
  };

  const closeProductModal = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetCropState();
    }
    setOpen(nextOpen);
  };

  const cancelProductModal = () => {
    resetCropState();
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setImageUploadError('');
    setOpen(false);
  };

  const uploadValidatedFiles = async (validFiles: File[], validationErrors: string[]) => {
    if (validFiles.length === 0) {
      setImageUploadError(validationErrors.join('\n'));
      return;
    }
    setImageUploading(true);
    setImageUploadError(validationErrors.join('\n'));
    const uploadedPaths: string[] = [];
    const uploadErrors: string[] = [];
    try {
      for (const file of validFiles) {
        try {
          const uploaded = await api.uploadProductImage(file);
          uploadedPaths.push(uploaded.path || uploaded.url);
        } catch (err) {
          const message = err instanceof Error ? err.message : t('admin.products.imageUploadFailed');
          uploadErrors.push(`${file.name}: ${message}`);
        }
      }
      if (uploadedPaths.length > 0) {
        setForm((prev: any) => ({
          ...prev,
          images: mergeImageUrls(Array.isArray(prev.images) ? prev.images : [], uploadedPaths)
        }));
      }
      const allErrors = [...validationErrors, ...uploadErrors];
      setImageUploadError(allErrors.join('\n'));
    } finally {
      setImageUploading(false);
    }
  };

  const uploadProductImages = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const selectedFiles = Array.from(files);
    const validationErrors: string[] = [];
    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      const lowerName = String(file.name || '').trim().toLowerCase();
      const dotIndex = lowerName.lastIndexOf('.');
      const extension = dotIndex >= 0 ? lowerName.substring(dotIndex + 1) : '';
      const imageMime = String(file.type || '').toLowerCase().startsWith('image/');
      if (file.size <= 0) {
        validationErrors.push(t('admin.products.imageFileEmpty', { name: file.name }));
        continue;
      }
      if (!extension || !ALLOWED_IMAGE_EXTENSIONS.has(extension) || !imageMime) {
        validationErrors.push(t('admin.products.imageFileTypeInvalid', { name: file.name }));
        continue;
      }
      if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
        validationErrors.push(t('admin.products.imageFileTooLarge', { name: file.name, maxMb: MAX_IMAGE_UPLOAD_MB }));
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) {
      setImageUploadError(validationErrors.join('\n') || t('admin.products.imageUploadFailed'));
      return;
    }
    openCropDialogForImages(validFiles, validationErrors);
  };

  const applyCropAndUpload = async (keepOriginal = false) => {
    if (!cropSourceFile || cropProcessing) {
      return;
    }
    const validationErrors = [...cropValidationErrors];
    const remainingFiles = [...cropPendingFiles];
    const originalFile = cropSourceFile;
    const cropX = cropXPercent;
    const cropY = cropYPercent;
    const zoom = cropZoom;

    setCropProcessing(true);
    let firstFile = originalFile;
    if (!keepOriginal) {
      try {
        firstFile = await cropImageFile(originalFile, {
          xPercent: cropX,
          yPercent: cropY,
          zoom,
          aspectRatio: PRODUCT_THUMBNAIL_ASPECT_RATIO,
          outputWidth: PRODUCT_THUMBNAIL_OUTPUT_WIDTH,
          outputHeight: PRODUCT_THUMBNAIL_OUTPUT_HEIGHT
        });
      } catch {
        validationErrors.push(t('admin.products.imageCropFailed', { name: originalFile.name }));
      }
    }

    resetCropState();
    await uploadValidatedFiles([firstFile, ...remainingFiles], validationErrors);
  };

  const cancelCropDialog = () => {
    const validationErrors = [...cropValidationErrors];
    resetCropState();
    setImageUploadError(validationErrors.join('\n'));
  };

  const removeImageAt = (index: number) => {
    setForm((prev: any) => {
      const images = Array.isArray(prev.images) ? prev.images : [];
      return { ...prev, images: images.filter((_: string, imageIndex: number) => imageIndex !== index) };
    });
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
      images: Array.isArray(form.images) ? form.images : [],
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
  const selectedImageCount = Array.isArray(form.images) ? form.images.length : 0;
  const hasSelectedCategoryInList = selectedCategory
    ? categories.some(category => category.name.toLowerCase() === selectedCategory.toLowerCase())
    : false;
  const resetCategoryFilter = () => {
    setCategoryFilter(ALL_CATEGORIES_FILTER);
  };

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
                <Button type="button" variant="outline" onClick={resetCategoryFilter}>
                  {t('admin.products.filterReset')}
                </Button>
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
                <div className="space-y-2">
                  <span className="text-sm font-semibold text-muted">{t('admin.products.images')}</span>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = e.target.files;
                      void uploadProductImages(files);
                      e.currentTarget.value = '';
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="button" variant="outline" className="shrink-0" onClick={() => imageInputRef.current?.click()}>
                      {t('admin.products.imageAdd')}
                    </Button>
                    <p className="text-xs text-muted">
                      {imageUploading
                        ? t('admin.products.imageUploading')
                        : selectedImageCount > 0
                          ? t('admin.products.imagesSelectedCount', { count: selectedImageCount })
                          : t('admin.products.imagesEmpty')}
                    </p>
                  </div>
                  {imageUploadError ? <p className="whitespace-pre-line text-xs text-red-600">{imageUploadError}</p> : null}
                  <p className="mt-1 text-xs text-muted">{t('admin.products.imagesHint')}</p>
                  <div className="mt-2 rounded-xl border border-border bg-cream p-3">
                    {Array.isArray(form.images) && form.images.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {form.images.slice(0, 8).map((url: string, index: number) => (
                          <div key={`${url}-${index}`} className="group relative">
                            <img
                              src={resolveProductImageUrl(url)}
                              alt={`preview-${index + 1}`}
                              className="h-16 w-full rounded-lg border border-border object-cover"
                              onError={event => {
                                event.currentTarget.style.display = 'none';
                              }}
                            />
                            <button
                              type="button"
                              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs text-white opacity-0 transition group-hover:opacity-100"
                              title={t('admin.products.imageRemove')}
                              aria-label={t('admin.products.imageRemove')}
                              onClick={() => removeImageAt(index)}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">{t('admin.products.imagesEmpty')}</p>
                    )}
                  </div>
                </div>
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

          <Dialog
            open={cropDialogOpen}
            onOpenChange={nextOpen => {
              if (!nextOpen) {
                cancelCropDialog();
              }
            }}
          >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('admin.products.imageCropTitle')}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted">{t('admin.products.imageCropHint')}</p>
              <div className="mt-3 overflow-hidden rounded-xl border border-border bg-[#f8f1e8]">
                {cropSourceUrl ? (
                  <div className="aspect-[16/9] w-full">
                    <img
                      src={cropSourceUrl}
                      alt={cropSourceFile?.name || 'crop-preview'}
                      className="h-full w-full object-cover"
                      style={{
                        objectPosition: `${cropXPercent}% ${cropYPercent}%`,
                        transform: `scale(${cropZoom})`,
                        transformOrigin: 'center center'
                      }}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[16/9] w-full items-center justify-center text-sm text-muted">{t('admin.products.imagesEmpty')}</div>
                )}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>{t('admin.products.imageCropZoom')}</span>
                    <span>{cropZoom.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={cropZoom}
                    onChange={event => setCropZoom(Number(event.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>{t('admin.products.imageCropHorizontal')}</span>
                    <span>{Math.round(cropXPercent)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cropXPercent}
                    onChange={event => setCropXPercent(Number(event.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted">
                    <span>{t('admin.products.imageCropVertical')}</span>
                    <span>{Math.round(cropYPercent)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={cropYPercent}
                    onChange={event => setCropYPercent(Number(event.target.value))}
                    className="w-full accent-accent"
                  />
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Button type="button" variant="ghost" onClick={cancelCropDialog} disabled={cropProcessing}>
                  {t('admin.products.imageCropCancel')}
                </Button>
                <Button type="button" variant="outline" onClick={() => void applyCropAndUpload(true)} disabled={cropProcessing}>
                  {t('admin.products.imageCropKeepOriginal')}
                </Button>
                <Button type="button" onClick={() => void applyCropAndUpload(false)} disabled={cropProcessing}>
                  {t('admin.products.imageCropApply')}
                </Button>
              </div>
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
