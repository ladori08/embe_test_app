'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-context';

export function TopNav() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    router.push('/shop');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/shop" className="text-2xl font-script text-ink">
          Embé Bakery
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/shop" className="px-3 py-2 text-sm text-muted ho`1`  ` ` ver:text-ink">
            Shop
          </Link>
          {user?.roles.includes('ADMIN') && (
            <Link href="/admin/dashboard" className="px-3 py-2 text-sm text-muted hover:text-ink">
              Admin
            </Link>
          )}
          {user ? (
            <>
              <span className="px-2 text-sm text-muted">{user.fullName}</span>
              <Button variant="outline" onClick={onLogout}>
                Logout
              </Button>
            </>
          ) : (
            <Button onClick={() => router.push('/login')}>Login</Button>
          )}
        </nav>
      </div>
    </header>
  );
}
