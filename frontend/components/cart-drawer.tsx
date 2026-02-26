'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useCart } from '@/components/cart-context';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/components/language-context';

export function CartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { items, subtotal, updateQty, removeItem } = useCart();
  const { t, money } = useI18n();
  const router = useRouter();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('drawer.title')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          {items.length === 0 && <p className="rounded-xl bg-[#f8f1e8] p-3 text-sm text-muted">{t('drawer.empty')}</p>}
          {items.map(item => (
            <div key={item.productId} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-sm text-muted">{money(item.price)}</p>
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
                <Button variant="outline" onClick={() => updateQty(item.productId, item.qty + 1)}>
                  +
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 border-t border-border pt-4">
          <div className="mb-3 flex justify-between text-sm">
            <span className="text-muted">{t('common.subtotal')}</span>
            <span className="font-semibold">{money(subtotal)}</span>
          </div>
          <Button
            className="w-full"
            disabled={items.length === 0}
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
