'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCart } from '@/components/cart-context';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/language-context';

export function CartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { items, subtotal, updateQty, removeItem } = useCart();
  const { t, moneyCompact } = useI18n();
  const router = useRouter();
  const hasRealtimeStockConflict = items.some(item => item.qty > item.maxQty);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('drawer.title')}</SheetTitle>
        </SheetHeader>
        <div className="rounded-xl border border-[#f2c79f] bg-[#fff1dd] px-3 py-2 text-xs leading-relaxed text-[#8b4d1f]">
          <p>{t('shop.preorderNotePrimary')}</p>
          <p className="mt-2">{t('shop.preorderNoteSecondary')}</p>
        </div>
        <div className="space-y-3">
          {items.length === 0 && <p className="rounded-xl bg-[#f8f1e8] p-3 text-sm text-muted">{t('drawer.empty')}</p>}
          {items.map(item => (
            <div key={item.productId} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{moneyCompact(item.price)}</p>
                </div>
                <button className="text-xs text-muted underline" onClick={() => removeItem(item.productId)}>
                  {t('common.remove')}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" onClick={() => updateQty(item.productId, item.qty - 1)}>
                  -
                </Button>
                <span className="w-10 text-center">{item.qty}</span>
                <Button variant="outline" onClick={() => updateQty(item.productId, item.qty + 1)} disabled={item.qty >= item.maxQty}>
                  +
                </Button>
              </div>
              {item.qty > item.maxQty ? (
                <p className="mt-2 text-xs text-red-600">{t('shop.insufficientStock', { name: item.name, available: item.maxQty })}</p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-border pt-4">
          {hasRealtimeStockConflict ? (
            <p className="mb-3 rounded-xl bg-[#fff1f1] p-2 text-xs text-red-600">{t('checkout.stockSyncWarning')}</p>
          ) : null}
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-muted">{t('common.subtotal')}</span>
            <span className="font-semibold">{moneyCompact(subtotal)}</span>
          </div>
          <Button
            variant="outline"
            className="mb-2 w-full"
            disabled={items.length === 0}
            onClick={() => {
              onOpenChange(false);
              router.push('/shop/cart');
            }}
          >
            {t('drawer.viewCart')}
          </Button>
          <Button
            className="w-full"
            disabled={items.length === 0 || hasRealtimeStockConflict}
            onClick={() => {
              onOpenChange(false);
              router.push('/shop/checkout');
            }}
          >
            {t('drawer.checkout')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
