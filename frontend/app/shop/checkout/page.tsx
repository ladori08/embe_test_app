'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { useCart } from '@/components/cart-context';
import { useAuth } from '@/components/auth-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { money } from '@/lib/utils';

export default function CheckoutPage() {
  const { items, subtotal, clear } = useCart();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tax, setTax] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  const onPlaceOrder = async () => {
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await api.createOrder({
        tax,
        items: items.map(item => ({ productId: item.productId, qty: item.qty }))
      });
      clear();
      setMessage('Order placed successfully. You can track it in your account/order list.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !user) {
    return (
      <>
        <TopNav />
        <main className="mx-auto max-w-3xl px-4 py-8 text-sm text-muted">Loading checkout...</main>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-4 text-3xl font-script">Checkout</h1>
        {items.length === 0 ? (
          <Card>Your cart is empty.</Card>
        ) : (
          <Card className="space-y-4">
            {items.map(item => (
              <div className="flex items-center justify-between" key={item.productId}>
                <span>{item.name} x {item.qty}</span>
                <span>{money(item.price * item.qty)}</span>
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <label className="text-sm text-muted">Tax</label>
              <Input type="number" value={tax} onChange={e => setTax(Number(e.target.value))} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{money(subtotal + tax)}</span>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}
            <Button disabled={submitting} onClick={onPlaceOrder} className="w-full">
              {submitting ? 'Placing order...' : 'Place Order'}
            </Button>
          </Card>
        )}
      </main>
    </>
  );
}
