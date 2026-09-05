'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/components/cart-context';
import { useI18n } from '@/components/language-context';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stockWarning, setStockWarning] = useState('');
  const [selectedQty, setSelectedQty] = useState(1);
  const { addItem, items, stockByProductId } = useCart();
  const { t, moneyCompact } = useI18n();

  useEffect(() => {
    if (!params.id) return;
    api
      .getPublicProduct(params.id)
      .then(setProduct)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  const inCartQty = product ? items.find(item => item.productId === product.id)?.qty || 0 : 0;
  const syncedStock = product ? stockByProductId[product.id] : undefined;
  const sourceStock = Number.isFinite(syncedStock) ? Number(syncedStock) : Number(product?.currentStock || 0);
  const remainingStock = product
    ? Math.max(0, Math.max(0, Math.floor(sourceStock)) - inCartQty)
    : 0;

  useEffect(() => {
    if (remainingStock <= 0) {
      setSelectedQty(0);
      return;
    }
    setSelectedQty(prev => {
      if (!Number.isFinite(prev) || prev <= 0) {
        return 1;
      }
      return Math.min(prev, remainingStock);
    });
  }, [remainingStock]);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-4xl px-3 py-5 sm:px-4 sm:py-8">
        <Link href="/shop" className="text-sm text-muted underline">
          {t('product.backToShop')}
        </Link>
        {loading && <Card className="mt-3">{t('product.loading')}</Card>}
        {error && <Card className="mt-3 text-red-600">{error}</Card>}
        {product && (
          <Card className="mt-3 reveal">
            <h1 className="break-words font-script text-4xl sm:text-5xl">{product.name}</h1>
            <p className="mt-2 text-muted">{product.category}</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-semibold">{moneyCompact(product.price)}</span>
              <Badge>{t('product.stock', { stock: remainingStock })}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted">{t('product.description')}</p>
            {stockWarning ? <p className="mt-2 text-sm text-red-600">{stockWarning}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted">{t('shop.quantity')}</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 px-0"
                  onClick={() => setSelectedQty(prev => Math.max(1, prev - 1))}
                  disabled={remainingStock <= 0 || selectedQty <= 1}
                >
                  -
                </Button>
                <span className="w-10 text-center tabular-nums">{selectedQty}</span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-9 px-0"
                  onClick={() => setSelectedQty(prev => Math.min(Math.max(1, remainingStock), prev + 1))}
                  disabled={remainingStock <= 0 || selectedQty >= remainingStock}
                >
                  +
                </Button>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:flex">
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  const result = addItem(product, selectedQty);
                  if (!result.ok) {
                    setStockWarning(t('shop.insufficientStock', { name: product.name, available: result.available }));
                    return;
                  }
                  setStockWarning('');
                  setSelectedQty(1);
                }}
                disabled={remainingStock <= 0 || selectedQty <= 0}
              >
                {t('shop.addToCart')}
              </Button>
              <Link href="/shop/cart" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto">{t('product.viewCart')}</Button>
              </Link>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
