'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TopNav } from '@/components/top-nav';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/components/auth-context';
import { useI18n } from '@/components/language-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, user } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin123!');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/shop');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TopNav />
      <main className="mx-auto max-w-md px-4 py-10">
        <Card className="reveal">
          <CardTitle className="font-script text-4xl">{t('login.welcomeBack')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <FormField label={t('login.email')}>
                <Input value={email} onChange={e => setEmail(e.target.value)} type="email" />
              </FormField>
              <FormField label={t('login.password')}>
                <Input value={password} onChange={e => setPassword(e.target.value)} type="password" />
              </FormField>
              {error && <FormMessage>{error}</FormMessage>}
              <Button className="w-full" disabled={loading}>
                {loading ? t('login.signingIn') : t('login.signIn')}
              </Button>
              {user && (
                <p className="text-sm text-muted">
                  {t('login.signedInAs', { email: user.email })}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
