'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/components/language-context';
import { useAuth } from '@/components/auth-context';
import { isSuperAdmin } from '@/lib/permissions';

export function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user } = useAuth();
  const superadmin = isSuperAdmin(user);
  const [compactSidebar, setCompactSidebar] = useState(false);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let rafId = 0;

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY;

        if (currentY <= 24) {
          setCompactSidebar(false);
        } else if (delta > 0) {
          setCompactSidebar(true);
        } else if (delta < 0) {
          setCompactSidebar(false);
        }

        lastScrollY = currentY;
        rafId = 0;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const links = [
    { href: '/admin/dashboard', label: t('admin.nav.dashboard') },
    { href: '/admin/ingredients', label: t('admin.nav.ingredients') },
    { href: '/admin/products', label: t('admin.nav.products') },
    { href: '/admin/media', label: t('admin.nav.media') },
    { href: '/admin/users', label: t('admin.nav.users') },
    { href: '/admin/recipes', label: t('admin.nav.recipes') },
    { href: '/admin/production', label: t('admin.nav.production') },
    { href: '/admin/orders', label: t('admin.nav.orders') },
    { href: '/admin/history', label: t('admin.nav.history') },
    ...(superadmin ? [{ href: '/admin/database', label: t('admin.nav.database') }] : [])
  ];

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-4 px-3 py-4 sm:px-4 sm:py-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6 xl:px-6 2xl:px-8">
      <aside
        className="sticky top-[68px] z-10 rounded-2xl border border-border bg-white/95 p-2 shadow-card backdrop-blur transition-[top,transform,box-shadow] duration-300 ease-out lg:top-auto lg:p-3 lg:sticky lg:max-h-[calc(100vh-100px)] lg:self-start lg:overflow-auto"
        style={{
          top: compactSidebar ? '64px' : '74px',
          transform: compactSidebar ? 'translateY(-2px)' : 'translateY(0)'
        }}
      >
        <h2 className="hidden px-2 pb-2 text-sm font-semibold uppercase tracking-wide text-muted lg:block">{t('admin.panel')}</h2>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'block shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:shrink lg:whitespace-normal',
                pathname === link.href
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-muted hover:bg-[#f5ede3] hover:text-ink'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </aside>
      <main className="min-w-0">
        <div className="mb-4 flex min-w-0 items-center justify-between rounded-2xl border border-border bg-white px-4 py-3 shadow-card">
          <h1 className="min-w-0 text-lg font-semibold sm:text-xl">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
