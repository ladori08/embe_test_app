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
      <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-3 xl:px-6 2xl:px-8">
        <Link href="/shop" className="flex min-w-0 items-center">
          {logoError ? (
            <span className="truncate text-xl font-script text-ink sm:text-2xl">embé.bakery</span>
          ) : (
            <img
              src={STORE_LOGO_URL}
              alt="embé.bakery"
              className="h-7 w-auto max-w-[150px] object-contain sm:h-8 sm:max-w-[170px]"
              onError={() => setLogoError(true)}
            />
          )}
        </Link>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1 sm:flex-nowrap sm:gap-2">
          <Link href="/shop" className="px-2 py-2 text-sm text-muted hover:text-ink sm:px-3">
            {t('nav.shop')}
          </Link>
          {hasRole(user, 'ADMIN') && (
            <Link href="/admin/dashboard" className="px-2 py-2 text-sm text-muted hover:text-ink sm:px-3">
              {t('nav.admin')}
            </Link>
          )}
          {!user ? (
            <Link href="/login" className="px-2 py-2 text-sm font-semibold text-ink hover:text-accent sm:px-3">
              {t('nav.login')}
            </Link>
          ) : null}
          <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border sm:ml-1">
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
              <span className="hidden max-w-[160px] truncate px-2 text-sm text-muted md:inline">{user.fullName}</span>
              <Button variant="outline" className="px-3" onClick={onLogout}>
                {t('nav.logout')}
              </Button>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
