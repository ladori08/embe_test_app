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
import { PaymentMethod } from '@/lib/types';

const CHECKOUT_INFO_STORAGE_KEY = 'embe-checkout-delivery-info';
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
  const [deliveryDate, setDeliveryDate] = useState('');
  const [deliveryTime, setDeliveryTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('COD_DEPOSIT');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [errorPopupMessage, setErrorPopupMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placedHoldDeadline, setPlacedHoldDeadline] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const hasRealtimeStockConflict = items.some(item => item.qty > item.maxQty);

  const showErrorPopup = (nextMessage: string) => {
    setMessage('');
    setErrorPopupMessage(nextMessage);
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

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
        deliveryDate?: string;
        deliveryTime?: string;
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
      if (parsed.deliveryDate) {
        setDeliveryDate(parsed.deliveryDate);
      }
      if (parsed.deliveryTime) {
        setDeliveryTime(parsed.deliveryTime);
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
        deliveryAddress: deliveryAddress.trim(),
        deliveryDate: deliveryDate.trim(),
        deliveryTime: deliveryTime.trim()
      })
    );
  }, [recipientName, recipientPhone, deliveryAddress, deliveryDate, deliveryTime]);

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
    const cleanDeliveryDate = deliveryDate.trim();
    const cleanDeliveryTime = deliveryTime.trim();
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
    if (!cleanDeliveryDate) {
      showErrorPopup(t('checkout.requiredDeliveryDate'));
      return;
    }
    if (!cleanDeliveryTime) {
      showErrorPopup(t('checkout.requiredDeliveryTime'));
      return;
    }

    setSubmitting(true);
    try {
      const createdOrder = await api.createOrder({
        items: items.map(item => ({ productId: item.productId, qty: item.qty })),
        recipientName: cleanName,
        recipientPhone: cleanPhone,
        deliveryAddress: cleanAddress,
        deliveryDate: cleanDeliveryDate,
        deliveryTime: cleanDeliveryTime,
        paymentMethod,
        note: cleanNote || null
      }, idempotencyKeyRef.current);
      clear();
      setNote('');
      const nextHoldDeadline = createdOrder.holdExpiresAt
        ? new Date(createdOrder.holdExpiresAt).getTime()
        : Date.now() + CHECKOUT_HOLD_WINDOW_MS;
      setPlacedHoldDeadline(nextHoldDeadline);
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

  const holdRemainingSeconds = placedHoldDeadline
    ? Math.max(0, Math.ceil((placedHoldDeadline - nowTs) / 1000))
    : Math.floor(CHECKOUT_HOLD_WINDOW_MS / 1000);
  const holdMinutes = String(Math.floor(holdRemainingSeconds / 60)).padStart(2, '0');
  const holdSeconds = String(holdRemainingSeconds % 60).padStart(2, '0');
  const holdCountdown = `${holdMinutes}:${holdSeconds}`;
  const today = new Date();
  const todayText = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const showPickupDateHint = !deliveryDate || deliveryDate === todayText;
  const depositAmount = paymentMethod === 'COD_DEPOSIT' ? subtotal * 0.5 : 0;

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-8">
        <h1 className="mb-4 text-3xl font-script">{t('checkout.title')}</h1>
        {message ? (
          <Card className="space-y-4">
            <p className="text-sm text-green-700">{message}</p>
            <p className="rounded-2xl border border-[#f2c79f] bg-[#fff1dd] px-4 py-3 text-sm font-medium leading-relaxed text-[#8b4d1f]">
              {t('checkout.holdNoticeWithTimer', { time: holdCountdown })}
            </p>
            <Link href="/shop" className="w-full">
              <Button type="button" className="w-full">
                {t('cart.backToShop')}
              </Button>
            </Link>
          </Card>
        ) : items.length === 0 ? (
          <Card>{t('checkout.empty')}</Card>
        ) : (
          <Card className="space-y-4">
            {items.map(item => (
              <div className="flex flex-wrap items-center justify-between gap-2" key={item.productId}>
                <span className="break-words">{item.name} x {item.qty}</span>
                <span className="font-medium">{money(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="space-y-3 border-t border-border pt-3">
              <div className="rounded-2xl border border-[#f2c79f] bg-[#fff1dd] px-4 py-3 text-sm leading-relaxed text-[#8b4d1f]">
                <p>{t('shop.preorderNotePrimary')}</p>
                <p className="mt-2">{t('shop.preorderNoteSecondary')}</p>
              </div>
              <p className="text-sm font-medium text-ink">{t('checkout.deliveryInfo')}</p>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-muted">{t('checkout.deliveryDate')}</label>
                  <Input
                    type="date"
                    min={todayText}
                    value={deliveryDate}
                    onChange={e => setDeliveryDate(e.target.value)}
                    onKeyDown={event => event.preventDefault()}
                    onPaste={event => event.preventDefault()}
                    onDrop={event => event.preventDefault()}
                    onClick={event => {
                      const dateInput = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
                      dateInput.showPicker?.();
                    }}
                    onFocus={event => {
                      const dateInput = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
                      dateInput.showPicker?.();
                    }}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-muted">{t('checkout.deliveryTime')}</label>
                  <Input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} />
                </div>
              </div>
              {showPickupDateHint ? (
                <p className="rounded-xl border border-[#f2c79f] bg-[#fff8f0] px-3 py-2 text-xs leading-relaxed text-[#8b4d1f]">
                  {t('checkout.pickupDateHint')}
                </p>
              ) : null}
              <div>
                <p className="mb-1 block text-sm text-muted">{t('checkout.paymentMethod')}</p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="COD_DEPOSIT"
                      checked={paymentMethod === 'COD_DEPOSIT'}
                      onChange={() => setPaymentMethod('COD_DEPOSIT')}
                    />
                    <span>{t('checkout.paymentCodDeposit')}</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="BANK_TRANSFER"
                      checked={paymentMethod === 'BANK_TRANSFER'}
                      onChange={() => setPaymentMethod('BANK_TRANSFER')}
                    />
                    <span>{t('checkout.paymentBankTransfer')}</span>
                  </label>
                </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-muted">{t('common.subtotal')}</span>
              <span>{money(subtotal)}</span>
            </div>
            {paymentMethod === 'COD_DEPOSIT' ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-muted">{t('checkout.depositAmount')}</span>
                <span>{money(depositAmount)}</span>
              </div>
            ) : null}
            <p className="rounded-xl border border-[#f2c79f] bg-[#fff8f0] px-3 py-2 text-xs leading-relaxed text-[#8b4d1f]">
              {t('checkout.shippingFeeNotice')}
            </p>
            <div className="flex flex-wrap items-center justify-between gap-2 text-base font-semibold">
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
