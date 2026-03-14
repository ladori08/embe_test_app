'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { useCart } from '@/components/cart-context';
import { useAuth } from '@/components/auth-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api';
import { useI18n } from '@/components/language-context';

const CHECKOUT_INFO_STORAGE_KEY = 'embe-checkout-delivery-info';
const CHECKOUT_HOLD_DEADLINE_STORAGE_KEY = 'embe-checkout-hold-deadline';
const CHECKOUT_HOLD_WINDOW_MS = 30 * 60 * 1000;

interface StockAdjustmentDetail {
  productId: string;
  name: string;
  requestedQty: number;
  availableQty: number;
}

interface InsufficientStockDetails {
  code?: string;
  adjustments?: StockAdjustmentDetail[];
}

export default function CheckoutPage() {
  const { items, subtotal, clear, updateQty, refreshStockSnapshot } = useCart();
  const { user } = useAuth();
  const { t, money } = useI18n();
  const idempotencyKeyRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [errorPopupMessage, setErrorPopupMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [holdDeadline, setHoldDeadline] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const hasRealtimeStockConflict = items.some(item => item.qty > item.maxQty);

  const showErrorPopup = (nextMessage: string) => {
    setMessage('');
    setErrorPopupMessage(nextMessage);
  };

  useEffect(() => {
    const now = Date.now();
    const raw = window.localStorage.getItem(CHECKOUT_HOLD_DEADLINE_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    const nextDeadline = Number.isFinite(parsed) && parsed > now ? parsed : now + CHECKOUT_HOLD_WINDOW_MS;
    window.localStorage.setItem(CHECKOUT_HOLD_DEADLINE_STORAGE_KEY, String(nextDeadline));
    setHoldDeadline(nextDeadline);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!holdDeadline || holdDeadline > nowTs) {
      return;
    }
    const nextDeadline = nowTs + CHECKOUT_HOLD_WINDOW_MS;
    window.localStorage.setItem(CHECKOUT_HOLD_DEADLINE_STORAGE_KEY, String(nextDeadline));
    setHoldDeadline(nextDeadline);
  }, [holdDeadline, nowTs]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHECKOUT_INFO_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as {
        recipientName?: string;
        recipientPhone?: string;
        deliveryAddress?: string;
      };
      if (parsed.recipientName) {
        setRecipientName(parsed.recipientName);
      }
      if (parsed.recipientPhone) {
        setRecipientPhone(parsed.recipientPhone);
      }
      if (parsed.deliveryAddress) {
        setDeliveryAddress(parsed.deliveryAddress);
      }
    } catch {
      // ignore malformed local cache
    }
  }, []);

  useEffect(() => {
    if (user?.fullName && !recipientName) {
      setRecipientName(user.fullName);
    }
  }, [user, recipientName]);

  useEffect(() => {
    window.localStorage.setItem(
      CHECKOUT_INFO_STORAGE_KEY,
      JSON.stringify({
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        deliveryAddress: deliveryAddress.trim()
      })
    );
  }, [recipientName, recipientPhone, deliveryAddress]);

  const onPlaceOrder = async () => {
    setErrorPopupMessage('');
    setMessage('');

    if (hasRealtimeStockConflict) {
      const adjustments = items
        .filter(item => item.qty > item.maxQty)
        .map(item => ({
          productId: item.productId,
          name: item.name,
          stock: Math.max(0, Math.floor(item.maxQty))
        }));
      adjustments.forEach(adjustment => updateQty(adjustment.productId, adjustment.stock));
      await refreshStockSnapshot();
      showErrorPopup(
        adjustments
          .map(adjustment =>
            t('checkout.autoAdjustedStock', {
              name: adjustment.name,
              stock: adjustment.stock
            })
          )
          .join(' ')
      );
      return;
    }

    const cleanName = recipientName.trim();
    const cleanPhone = recipientPhone.trim();
    const cleanAddress = deliveryAddress.trim();
    const cleanNote = note.trim();

    if (!cleanName) {
      showErrorPopup(t('checkout.requiredRecipientName'));
      return;
    }
    if (!cleanPhone) {
      showErrorPopup(t('checkout.requiredRecipientPhone'));
      return;
    }
    if (!/^[0-9+\-\s()]{8,20}$/.test(cleanPhone)) {
      showErrorPopup(t('checkout.invalidRecipientPhone'));
      return;
    }
    if (!cleanAddress) {
      showErrorPopup(t('checkout.requiredDeliveryAddress'));
      return;
    }

    setSubmitting(true);
    try {
      await api.createOrder({
        items: items.map(item => ({ productId: item.productId, qty: item.qty })),
        recipientName: cleanName,
        recipientPhone: cleanPhone,
        deliveryAddress: cleanAddress,
        note: cleanNote || null
      }, idempotencyKeyRef.current);
      clear();
      setNote('');
      setMessage(t('checkout.success'));
      idempotencyKeyRef.current =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `checkout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const details = err.details as InsufficientStockDetails | null;
        if (details?.code === 'INSUFFICIENT_STOCK' && Array.isArray(details.adjustments) && details.adjustments.length > 0) {
          details.adjustments.forEach(adjustment => {
            const normalizedStock = Math.max(0, Math.floor(Number(adjustment.availableQty || 0)));
            updateQty(adjustment.productId, normalizedStock);
          });
          await refreshStockSnapshot();
          const lines = details.adjustments.map(adjustment =>
            t('checkout.autoAdjustedStock', {
              name: adjustment.name || adjustment.productId,
              stock: Math.max(0, Math.floor(Number(adjustment.availableQty || 0)))
            })
          );
          showErrorPopup(lines.join(' '));
          return;
        }
      }
      showErrorPopup(err instanceof Error ? err.message : t('checkout.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const holdRemainingSeconds = holdDeadline
    ? Math.max(0, Math.ceil((holdDeadline - nowTs) / 1000))
    : Math.floor(CHECKOUT_HOLD_WINDOW_MS / 1000);
  const holdMinutes = String(Math.floor(holdRemainingSeconds / 60)).padStart(2, '0');
  const holdSeconds = String(holdRemainingSeconds % 60).padStart(2, '0');
  const holdCountdown = `${holdMinutes}:${holdSeconds}`;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-script">{t('checkout.title')}</h1>
        {message && <p className="mb-3 text-sm text-green-700">{message}</p>}
        {items.length === 0 ? (
          <Card>{t('checkout.empty')}</Card>
        ) : (
          <Card className="space-y-4">
            {items.map(item => (
              <div className="flex items-center justify-between" key={item.productId}>
                <span>{item.name} x {item.qty}</span>
                <span>{money(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="space-y-3 border-t border-border pt-3">
              <p className="text-sm font-medium text-ink">{t('checkout.deliveryInfo')}</p>
              <p className="rounded-2xl border border-[#f2c79f] bg-[#fff1dd] px-4 py-3 text-sm font-medium leading-relaxed text-[#8b4d1f]">
                {t('checkout.holdNoticeWithTimer', { time: holdCountdown })}
              </p>
              <div>
                <label className="mb-1 block text-sm text-muted">{t('checkout.recipientName')}</label>
                <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">{t('checkout.recipientPhone')}</label>
                <Input value={recipientPhone} onChange={e => setRecipientPhone(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">{t('checkout.deliveryAddress')}</label>
                <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">{t('checkout.note')}</label>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-border bg-cream px-3 py-2 text-sm outline-none transition focus:border-accent"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{t('common.subtotal')}</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>{t('common.total')}</span>
              <span>{money(subtotal)}</span>
            </div>
            <Button disabled={submitting} onClick={onPlaceOrder} className="w-full">
              {submitting ? t('checkout.placingOrder') : t('checkout.placeOrder')}
            </Button>
            <Link href="/shop" className="w-full">
              <Button type="button" variant="outline" className="w-full">
                {t('cart.backToShop')}
              </Button>
            </Link>
          </Card>
        )}
      </main>
      <Dialog open={Boolean(errorPopupMessage)} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" hideCloseButton>
          <DialogHeader>
            <DialogTitle>{t('checkout.errorPopupTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm leading-relaxed text-ink">{errorPopupMessage}</p>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={() => setErrorPopupMessage('')}>
              {t('common.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
