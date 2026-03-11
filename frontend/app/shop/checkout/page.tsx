'use client';

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/top-nav';
import { useCart } from '@/components/cart-context';
import { useAuth } from '@/components/auth-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useI18n } from '@/components/language-context';

const CHECKOUT_INFO_STORAGE_KEY = 'embe-checkout-delivery-info';

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const { user } = useAuth();
  const { t, money } = useI18n();
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    setError('');
    setMessage('');

    const cleanName = recipientName.trim();
    const cleanPhone = recipientPhone.trim();
    const cleanAddress = deliveryAddress.trim();
    const cleanNote = note.trim();

    if (!cleanName) {
      setError(t('checkout.requiredRecipientName'));
      return;
    }
    if (!cleanPhone) {
      setError(t('checkout.requiredRecipientPhone'));
      return;
    }
    if (!/^[0-9+\-\s()]{8,20}$/.test(cleanPhone)) {
      setError(t('checkout.invalidRecipientPhone'));
      return;
    }
    if (!cleanAddress) {
      setError(t('checkout.requiredDeliveryAddress'));
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
      });
      clear();
      setNote('');
      setMessage(t('checkout.success'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('checkout.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-script">{t('checkout.title')}</h1>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
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
          </Card>
        )}
      </main>
    </>
  );
}
