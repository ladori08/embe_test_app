'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Role } from '@/lib/types';
import { useAuth } from '@/components/auth-context';
import { useI18n } from '@/components/language-context';
import { hasRole } from '@/lib/permissions';

export function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login');
      } else if (!hasRole(user, role)) {
        router.replace('/shop');
      }
    }
  }, [loading, user, role, router]);

  if (loading || !user || !hasRole(user, role)) {
    return <div className="p-6 text-sm text-muted">{t('permission.checking')}</div>;
  }

  return <>{children}</>;
}
