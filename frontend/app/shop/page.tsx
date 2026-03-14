'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ShoppingBag } from 'lucide-react';
import { TopNav } from '@/components/top-nav';
import { Doodle } from '@/components/doodle';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CartDrawer } from '@/components/cart-drawer';
import { useCart } from '@/components/cart-context';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stockWarning, setStockWarning] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedQty, setSelectedQty] = useState<Record<string, number>>({});
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

  useEffect(() => {
    api
      .listPublicProducts()
      .then(setProducts)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

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
                <Card key={product.id} className="reveal">
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription>{product.category}</CardDescription>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold">{moneyCompact(product.price)}</span>
                      <Badge>{t('shop.stock', { stock: remainingStock })}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
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
                    <div className="flex gap-2">
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
                      <Link className="flex-1" href={`/shop/product/${product.id}`}>
                        <Button variant="outline" className="w-full">
                          {t('shop.details')}
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
