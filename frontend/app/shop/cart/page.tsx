'use client';

import Link from 'next/link';
import { useCart } from '@/components/cart-context';
import { TopNav } from '@/components/top-nav';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{money(item.price)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-24"
                    min={1}
                    value={item.qty}
                    onChange={e => updateQty(item.productId, Number(e.target.value))}
                  />
                  <button className="text-sm text-muted underline" onClick={() => removeItem(item.productId)}>
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
              <Link href="/shop/checkout" className="mt-3 inline-block w-full">
                <Button className="w-full">{t('cart.proceedToCheckout')}</Button>
              </Link>
            </Card>
          </div>
        )}
      </main>
    </>
  );
}
