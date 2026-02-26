'use client';

import { AuthProvider } from '@/components/auth-context';
import { CartProvider } from '@/components/cart-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  );
}
