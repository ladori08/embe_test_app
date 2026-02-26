'use client';

import { AuthProvider } from '@/components/auth-context';
import { CartProvider } from '@/components/cart-context';
import { LanguageProvider } from '@/components/language-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
