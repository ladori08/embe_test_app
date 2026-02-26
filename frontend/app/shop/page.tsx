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
import { api } from '@/lib/api';
import { Product } from '@/lib/types';
import { money } from '@/lib/utils';

export default function ShopPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const { addItem, items } = useCart();

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
          <p className="text-sm uppercase tracking-[0.2em] text-muted">Freshly Baked Daily</p>
          <h1 className="mt-2 max-w-2xl font-script text-5xl leading-tight text-ink">Warm pastries and coffee, crafted with care.</h1>
          <p className="mt-3 max-w-xl text-muted">Embé blends artisan bakery favorites with cafe comfort. Pre-order online and pick up with ease.</p>
          <div className="mt-6 flex gap-3">
            <Button onClick={() => setCartOpen(true)}>
              <ShoppingBag className="mr-2 h-4 w-4" /> Cart ({items.length})
            </Button>
            <Link href="/shop/checkout">
              <Button variant="outline">Quick Checkout</Button>
            </Link>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Storefront</h2>
            <Badge>{products.length} items</Badge>
          </div>

          {loading && <p className="rounded-xl bg-white p-4 text-sm text-muted">Loading products...</p>}
          {error && <p className="rounded-xl bg-white p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && products.length === 0 && (
            <p className="rounded-xl bg-white p-4 text-sm text-muted">No active products yet.</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(product => (
              <Card key={product.id} className="reveal">
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>{product.category}</CardDescription>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold">{money(product.price)}</span>
                    <Badge>Stock {product.currentStock}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => addItem(product)} className="flex-1">
                      Add to Cart
                    </Button>
                    <Link className="flex-1" href={`/shop/product/${product.id}`}>
                      <Button variant="outline" className="w-full">
                        Details
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
