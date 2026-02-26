'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth-context';
import { useI18n } from '@/components/language-context';

export function TopNav() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useI18n();
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
          <Link href="/shop" className="px-3 py-2 text-sm text-muted hover:text-ink">
            {t('nav.shop')}
          </Link>
          {user?.roles.includes('ADMIN') && (
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
          ) : (
            <Button onClick={() => router.push('/login')}>{t('nav.login')}</Button>
          )}
        </nav>
      </div>
    </header>
  );
}
