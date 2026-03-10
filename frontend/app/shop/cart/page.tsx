'use client';

import Link from 'next/link';
import { useCart } from '@/components/cart-context';
import { TopNav } from '@/components/top-nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useI18n } from '@/components/language-context';

export default function CartPage() {
  const { items, subtotal, updateQty, removeItem } = useCart();
  const { t, money } = useI18n();

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-script">{t('cart.title')}</h1>
        {items.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t('cart.empty')}</p>
            <Link href="/shop" className="mt-3 inline-block">
              <Button>{t('cart.backToShop')}</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <Card key={item.productId} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{money(item.price)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted">{t('cart.lineTotal')}</p>
                    <p className="font-semibold">{money(item.price * item.qty)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" className="h-9 w-9 px-0" onClick={() => updateQty(item.productId, item.qty - 1)}>
                      -
                    </Button>
                    <span className="w-10 text-center tabular-nums">{item.qty}</span>
                    <Button type="button" variant="outline" className="h-9 w-9 px-0" onClick={() => updateQty(item.productId, item.qty + 1)}>
                      +
                    </Button>
                  </div>
                  <button type="button" className="text-sm text-muted underline" onClick={() => removeItem(item.productId)}>
                    {t('common.remove')}
                  </button>
                </div>
              </Card>
            ))}
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{t('common.subtotal')}</span>
                <span className="text-lg font-semibold">{money(subtotal)}</span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Link href="/shop" className="w-full">
                  <Button variant="outline" className="w-full">{t('cart.backToShop')}</Button>
                </Link>
                <Link href="/shop/checkout" className="w-full">
                  <Button className="w-full">{t('cart.proceedToCheckout')}</Button>
                </Link>
              </div>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
