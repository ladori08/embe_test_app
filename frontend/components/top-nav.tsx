'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-context';
import { useI18n } from '@/components/language-context';
import { hasRole } from '@/lib/permissions';

const STORE_LOGO_URL = '/embe-logo-topnav.png';

export function TopNav() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);

  const onLogout = async () => {
    await logout();
    router.push('/shop');
  };

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full items-center justify-between px-3 py-3 sm:px-4 xl:px-6 2xl:px-8">
        <Link href="/shop" className="flex items-center">
          {logoError ? (
            <span className="text-2xl font-script text-ink">embé.bakery</span>
          ) : (
            <img
              src={STORE_LOGO_URL}
              alt="embé.bakery"
              className="h-7 w-auto max-w-[170px] object-contain sm:h-8"
              onError={() => setLogoError(true)}
            />
          )}
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/shop" className="px-3 py-2 text-sm text-muted hover:text-ink">
            {t('nav.shop')}
          </Link>
          {hasRole(user, 'ADMIN') && (
            <Link href="/admin/dashboard" className="px-3 py-2 text-sm text-muted hover:text-ink">
              {t('nav.admin')}
            </Link>
          )}
          <div className="ml-1 inline-flex overflow-hidden rounded-md border border-border">
            <button
              type="button"
              className={`px-2 py-1 text-xs ${locale === 'en' ? 'bg-accent text-white' : 'text-muted hover:bg-[#f5ede3]'}`}
              onClick={() => setLocale('en')}
              aria-label={t('nav.language')}
            >
              {t('lang.en')}
            </button>
            <button
              type="button"
              className={`px-2 py-1 text-xs ${locale === 'vi' ? 'bg-accent text-white' : 'text-muted hover:bg-[#f5ede3]'}`}
              onClick={() => setLocale('vi')}
              aria-label={t('nav.language')}
            >
              {t('lang.vi')}
            </button>
          </div>
          {user ? (
            <>
              <span className="px-2 text-sm text-muted">{user.fullName}</span>
              <Button variant="outline" onClick={onLogout}>
                {t('nav.logout')}
              </Button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
