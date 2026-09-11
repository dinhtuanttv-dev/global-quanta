import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { Language, ThemeMode } from '../types/cycleFingerprint';
import { CF_TRANSLATIONS, type CfTranslationKey } from './translations';

const LANG_STORAGE_KEY = 'cf-tab-lang';
const THEME_STORAGE_KEY = 'cf-tab-theme';

interface CfI18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  t: (key: CfTranslationKey, vars?: Record<string, string | number>) => string;
}

const CfI18nContext = createContext<CfI18nContextValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    template,
  );
}

function readInitial<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  return (allowed as readonly string[]).includes(stored ?? '') ? (stored as T) : fallback;
}

/**
 * GIAI ĐOẠN 1: giữ nguyên hạ tầng đa ngôn ngữ/theme (để mọi component con
 * dùng t() không phải viết lại), nhưng KHÔNG hiển thị công tắc chuyển đổi
 * trên UI (app hiện tại chỉ có 1 theme tối, không đa ngôn ngữ - tránh giải
 * quyết vấn đề chưa tồn tại). Mặc định luôn 'vi' + 'dark'.
 */
export function CfI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => readInitial(LANG_STORAGE_KEY, 'vi', ['vi', 'en']));
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    readInitial(THEME_STORAGE_KEY, 'dark', ['light', 'dark']),
  );

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-cf-theme', theme);
  }, [theme]);

  const t = useCallback(
    (key: CfTranslationKey, vars?: Record<string, string | number>) =>
      interpolate(CF_TRANSLATIONS[lang][key] ?? key, vars),
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, theme, setTheme, t }), [lang, setLang, theme, setTheme, t]);

  return <CfI18nContext.Provider value={value}>{children}</CfI18nContext.Provider>;
}

export function useCfI18n(): CfI18nContextValue {
  const ctx = useContext(CfI18nContext);
  if (!ctx) {
    throw new Error('useCfI18n phải được gọi bên trong <CfI18nProvider>.');
  }
  return ctx;
}
