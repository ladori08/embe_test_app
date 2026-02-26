'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/components/cart-context';
import { api } from '@/lib/api';
import { Product } from '@/lib/types';
import { money } from '@/lib/utils';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addItem } = useCart();

  useEffect(() => {
    if (!params.id) return;
    api
      .getPublicProduct(params.id)
      .then(setProduct)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link href="/shop" className="text-sm text-muted underline">
          Back to shop
        </Link>
        {loading && <Card className="mt-3">Loading product...</Card>}
        {error && <Card className="mt-3 text-red-600">{error}</Card>}
        {product && (
          <Card className="mt-3 reveal">
            <h1 className="font-script text-5xl">{product.name}</h1>
            <p className="mt-2 text-muted">{product.category}</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-2xl font-semibold">{money(product.price)}</span>
              <Badge>Stock {product.currentStock}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted">Crafted in-house with premium ingredients and a warm cafe touch.</p>
            <div className="mt-5 flex gap-3">
              <Button onClick={() => addItem(product)}>Add to Cart</Button>
              <Link href="/shop/checkout">
                <Button variant="outline">Checkout Now</Button>
              </Link>
            </div>
          </Card>
        )}
      </main>
    </>
  );
}
