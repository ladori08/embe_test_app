'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  formatMoneyByLocale,
  getInitialLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  Locale,
  TranslationParams,
  translate
} from '@/lib/i18n';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
  money: (value: number) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) {
      setLocale(stored);
      return;
    }
    setLocale(getInitialLocale(window.navigator.language));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const t = useCallback(
    (key: string, params?: TranslationParams) => translate(locale, key, params),
    [locale]
  );

  const money = useCallback((value: number) => formatMoneyByLocale(locale, value), [locale]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      money
    }),
    [locale, t, money]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useI18n must be used inside LanguageProvider');
  }
  return context;
}
