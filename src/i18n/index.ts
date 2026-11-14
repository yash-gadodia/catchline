import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { en, type Key } from './en';
import { es } from './es';
import { ptBR } from './pt-BR';
import { fr } from './fr';
import { de } from './de';
import { it } from './it';
import { ja } from './ja';
import { ko } from './ko';
import { zhHans } from './zh-Hans';
import type { Entry } from './types';

export type { Key } from './en';
export type Locale = 'en' | 'es' | 'pt-BR' | 'fr' | 'de' | 'it' | 'ja' | 'ko' | 'zh-Hans';
export type Language = 'system' | Locale;
export type Vars = Record<string, string | number>;
export type Catalogue = Partial<Record<Key, Entry>>;

export const LOCALES: Locale[] = ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'ja', 'ko', 'zh-Hans'];
// Each language in its own name, so it is findable whatever the app is set to.
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  'zh-Hans': '简体中文',
};

export const CATALOGUES: Record<Locale, Catalogue> = { en, es, 'pt-BR': ptBR, fr, de, it, ja, ko, 'zh-Hans': zhHans };

// Any Portuguese gets Brazilian. Chinese gets Simplified when the tag says Hans, or names no script and is
// bare `zh` or from CN or SG; Traditional (Hant, or TW/HK/MO with no script) has no catalogue and, like any
// other language, falls back to English.
export function resolveLocale(tag: string | null | undefined): Locale {
  const [lang, ...rest] = (tag ?? '').toLowerCase().split(/[-_]/);
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'zh') {
    if (rest.includes('hant')) return 'en';
    return rest.includes('hans') || rest.length === 0 || rest.includes('cn') || rest.includes('sg') ? 'zh-Hans' : 'en';
  }
  return LOCALES.find((l) => l === lang) ?? 'en';
}

export function deviceLocale(): Locale {
  return resolveLocale(getLocales()[0]?.languageTag);
}

export const useLocale = create<{ locale: Locale }>(() => ({ locale: deviceLocale() }));

export function getLocale(): Locale {
  return useLocale.getState().locale;
}

export function setLanguage(language: Language): void {
  const locale = language === 'system' ? deviceLocale() : language;
  if (locale !== getLocale()) useLocale.setState({ locale });
}

// CLDR cardinals for our languages: French and Portuguese count 0 and 1 as "one"; Japanese, Korean and
// Chinese have no plural forms.
export function pluralCategory(locale: Locale, n: number): 'one' | 'other' {
  if (locale === 'ja' || locale === 'ko' || locale === 'zh-Hans') return 'other';
  if (locale === 'fr' || locale === 'pt-BR') return Math.trunc(Math.abs(n)) <= 1 ? 'one' : 'other';
  return n === 1 ? 'one' : 'other';
}

export function formatNumber(n: number, locale: Locale = getLocale(), opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2, ...opts }).format(n);
}

export function formatDate(d: Date, opts: Intl.DateTimeFormatOptions, locale: Locale = getLocale()): string {
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

function interpolate(s: string, locale: Locale, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v == null) return whole;
    return typeof v === 'number' ? formatNumber(v, locale) : v;
  });
}

export function translate(locale: Locale, key: Key, vars?: Vars, catalogues: Record<Locale, Catalogue> = CATALOGUES): string {
  const entry = catalogues[locale][key] ?? en[key];
  if (typeof entry === 'string') return interpolate(entry, locale, vars);
  const count = Number(vars?.count ?? 0);
  return interpolate(entry[pluralCategory(locale, count)], locale, vars);
}

export function t(key: Key, vars?: Vars): string {
  return translate(getLocale(), key, vars);
}

export function isKey(key: string): key is Key {
  return Object.prototype.hasOwnProperty.call(en, key);
}
