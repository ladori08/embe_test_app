'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { TopNav } from '@/components/top-nav';
import { Doodle } from '@/components/doodle';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CartDrawer } from '@/components/cart-drawer';
import { useCart } from '@/components/cart-context';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { resolveProductImageUrl } from '@/lib/product-images';
import { Product } from '@/lib/types';

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stockWarning, setStockWarning] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailImageIndex, setDetailImageIndex] = useState(0);
  const { addItem, itemCount, items, stockByProductId } = useCart();
  const { t, moneyCompact } = useI18n();

  const getInCartQty = (productId: string) => {
    const item = items.find(cartItem => cartItem.productId === productId);
    return item ? item.qty : 0;
  };

  const getRemainingStock = (product: Product) => {
    const syncedStock = stockByProductId[product.id];
    const sourceStock = Number.isFinite(syncedStock) ? syncedStock : Number(product.currentStock);
    const currentStock = Number.isFinite(sourceStock) ? Math.max(0, Math.floor(sourceStock)) : 0;
    return Math.max(0, currentStock - getInCartQty(product.id));
  };

  const getProductImages = (product: Product) => {
    if (!Array.isArray(product.images) || product.images.length === 0) {
      return [];
    }
    return product.images.map(image => resolveProductImageUrl(image)).filter(Boolean);
  };

  const getPrimaryImage = (product: Product) => {
    const images = getProductImages(product);
    return images[0] || '';
  };

  const getSelectedQty = (productId: string, maxQty: number) => {
    if (maxQty <= 0) {
      return 0;
    }
    const raw = selectedQty[productId];
    if (!Number.isFinite(raw) || raw == null) {
      return 1;
    }
    return Math.max(1, Math.min(Math.floor(raw), maxQty));
  };

  const setQty = (productId: string, qty: number, maxQty: number) => {
    if (maxQty <= 0) {
      setSelectedQty(prev => ({ ...prev, [productId]: 0 }));
      return;
    }
    const clamped = Math.max(1, Math.min(Math.floor(qty), maxQty));
    setSelectedQty(prev => ({
      ...prev,
      [productId]: clamped
    }));
  };

  const openDetail = (product: Product) => {
    setDetailProduct(product);
    setDetailImageIndex(0);
    setDetailOpen(true);
  };

  const closeDetail = (nextOpen: boolean) => {
    setDetailOpen(nextOpen);
    if (!nextOpen) {
      setDetailProduct(null);
      setDetailImageIndex(0);
    }
  };

  useEffect(() => {
    api
      .listPublicProducts()
      .then(setProducts)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const detailImages = detailProduct ? getProductImages(detailProduct) : [];

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        <section className="relative mb-10 overflow-hidden rounded-3xl border border-border bg-white p-8 shadow-card reveal">
          <Doodle className="scribble -right-2 top-3" />
          <Doodle className="scribble bottom-2 left-2" />
          <p className="text-sm uppercase tracking-[0.2em] text-muted">{t('shop.heroTag')}</p>
          <h1 className="mt-2 max-w-2xl font-script text-5xl leading-tight text-ink">{t('shop.heroTitle')}</h1>
          <p className="mt-3 max-w-xl text-muted">{t('shop.heroDesc')}</p>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => setCartOpen(true)}>
              <ShoppingBag className="mr-2 h-4 w-4" /> {t('shop.cartCta', { count: itemCount })}
            </Button>
            <Link href="/shop/checkout">
              <Button variant="outline">{t('shop.quickCheckout')}</Button>
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">{t('shop.title')}</h2>
            <Badge>{t('shop.itemsCount', { count: products.length })}</Badge>
          </div>

          {loading && <p className="rounded-xl bg-white p-4 text-sm text-muted">{t('shop.loading')}</p>}
          {error && <p className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</p>}
          {stockWarning && <p className="rounded-xl bg-white p-4 text-sm text-red-600">{stockWarning}</p>}
          {!loading && !error && products.length === 0 && (
            <p className="rounded-xl bg-white p-4 text-sm text-muted">{t('shop.empty')}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(product => {
              const remainingStock = getRemainingStock(product);
              const pickedQty = getSelectedQty(product.id, remainingStock);

              return (
                <Card
                  key={product.id}
                  className="reveal cursor-pointer transition hover:-translate-y-0.5 hover:border-accent/40"
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(product)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openDetail(product);
                    }
                  }}
                >
                  {getPrimaryImage(product) ? (
                    <img src={getPrimaryImage(product)} alt={product.name} className="mb-3 aspect-[16/9] w-full rounded-xl border border-border object-cover" />
                  ) : (
                    <div className="mb-3 flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-border bg-[#f8f1e8] text-xs text-muted">
                      {t('shop.imageEmpty')}
                    </div>
                  )}
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.category}</CardDescription>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{moneyCompact(product.price)}</span>
                      <Badge>{t('shop.stock', { stock: remainingStock })}</Badge>
                    </div>
                    <div className="flex items-center justify-between" onClick={event => event.stopPropagation()}>
                      <span className="text-sm text-muted">{t('shop.quantity')}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 w-9 px-0"
                          onClick={() => setQty(product.id, pickedQty - 1, remainingStock)}
                          disabled={remainingStock <= 0 || pickedQty <= 1}
                        >
                          -
                        </Button>
                        <span className="w-10 text-center tabular-nums">{pickedQty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 w-9 px-0"
                          onClick={() => setQty(product.id, pickedQty + 1, remainingStock)}
                          disabled={remainingStock <= 0 || pickedQty >= remainingStock}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={event => event.stopPropagation()}>
                      <Button
                        onClick={() => {
                          const result = addItem(product, pickedQty);
                          if (!result.ok) {
                            setStockWarning(t('shop.insufficientStock', { name: product.name, available: result.available }));
                            return;
                          }
                          setStockWarning('');
                          setSelectedQty(prev => ({ ...prev, [product.id]: result.available > 0 ? 1 : 0 }));
                        }}
                        className="flex-1"
                        disabled={remainingStock <= 0 || pickedQty <= 0}
                      >
                        {t('shop.addToCart')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="px-3"
                        onClick={() => {
                          const result = addItem(product, 1);
                          if (!result.ok) {
                            setStockWarning(t('shop.insufficientStock', { name: product.name, available: result.available }));
                            return;
                          }
                          setStockWarning('');
                        }}
                        disabled={remainingStock <= 0}
                      >
                        {t('shop.quickAddOne')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
      <Dialog open={detailOpen} onOpenChange={closeDetail}>
        <DialogContent className="max-w-2xl">
          {detailProduct ? (
            <>
              <DialogHeader>
                <DialogTitle>{detailProduct.name}</DialogTitle>
              </DialogHeader>
              {detailImages[detailImageIndex] || getPrimaryImage(detailProduct) ? (
                <img
                  src={detailImages[detailImageIndex] || getPrimaryImage(detailProduct)}
                  alt={detailProduct.name}
                  className="aspect-[16/9] w-full rounded-xl border border-border object-cover"
                />
              ) : (
                <div className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-dashed border-border bg-[#f8f1e8] text-sm text-muted">
                  {t('shop.imageEmpty')}
                </div>
              )}
              {detailImages.length > 1 ? (
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {detailImages.map((imageUrl, index) => (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      className={`overflow-hidden rounded-lg border ${detailImageIndex === index ? 'border-accent' : 'border-border'}`}
                      onClick={() => setDetailImageIndex(index)}
                    >
                      <img src={imageUrl} alt={`${detailProduct.name}-${index + 1}`} className="h-14 w-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-sm text-muted">{detailProduct.category}</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-xl font-semibold">{moneyCompact(detailProduct.price)}</span>
                <Badge>{t('product.stock', { stock: getRemainingStock(detailProduct) })}</Badge>
              </div>
              <p className="mt-3 text-sm text-muted">{t('product.description')}</p>
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm text-muted">{t('shop.quantity')}</span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-9 px-0"
                    onClick={() =>
                      setQty(
                        detailProduct.id,
                        getSelectedQty(detailProduct.id, getRemainingStock(detailProduct)) - 1,
                        getRemainingStock(detailProduct)
                      )
                    }
                    disabled={getRemainingStock(detailProduct) <= 0 || getSelectedQty(detailProduct.id, getRemainingStock(detailProduct)) <= 1}
                  >
                    -
                  </Button>
                  <span className="w-10 text-center tabular-nums">{getSelectedQty(detailProduct.id, getRemainingStock(detailProduct))}</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-9 px-0"
                    onClick={() =>
                      setQty(
                        detailProduct.id,
                        getSelectedQty(detailProduct.id, getRemainingStock(detailProduct)) + 1,
                        getRemainingStock(detailProduct)
                      )
                    }
                    disabled={
                      getRemainingStock(detailProduct) <= 0 ||
                      getSelectedQty(detailProduct.id, getRemainingStock(detailProduct)) >= getRemainingStock(detailProduct)
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    const qty = getSelectedQty(detailProduct.id, getRemainingStock(detailProduct));
                    const result = addItem(detailProduct, qty);
                    if (!result.ok) {
                      setStockWarning(t('shop.insufficientStock', { name: detailProduct.name, available: result.available }));
                      return;
                    }
                    setStockWarning('');
                    setSelectedQty(prev => ({ ...prev, [detailProduct.id]: result.available > 0 ? 1 : 0 }));
                  }}
                  disabled={getRemainingStock(detailProduct) <= 0 || getSelectedQty(detailProduct.id, getRemainingStock(detailProduct)) <= 0}
                >
                  {t('shop.addToCart')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const result = addItem(detailProduct, 1);
                    if (!result.ok) {
                      setStockWarning(t('shop.insufficientStock', { name: detailProduct.name, available: result.available }));
                      return;
                    }
                    setStockWarning('');
                  }}
                  disabled={getRemainingStock(detailProduct) <= 0}
                >
                  {t('shop.quickAddOne')}
                </Button>
                <Link href="/shop/cart">
                  <Button type="button" variant="outline">
                    {t('product.viewCart')}
                  </Button>
                </Link>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
