import { getLocales } from 'expo-localization';
import { create } from 'zustand';
import { en, type Key } from './en';
import { es } from './es';
import { ptBR } from './pt-BR';
import { fr } from './fr';
import { de } from './de';
import type { Entry } from './types';

export type { Key } from './en';
export type Locale = 'en' | 'es' | 'pt-BR' | 'fr' | 'de';
export type Language = 'system' | Locale;
export type Vars = Record<string, string | number>;
export type Catalogue = Partial<Record<Key, Entry>>;

export const LOCALES: Locale[] = ['en', 'es', 'pt-BR', 'fr', 'de'];
// Each language in its own name, so it is findable whatever the app is set to.
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  fr: 'Français',
  de: 'Deutsch',
};

export const CATALOGUES: Record<Locale, Catalogue> = { en, es, 'pt-BR': ptBR, fr, de };

// Any Portuguese gets Brazilian; any other language falls back to English.
export function resolveLocale(tag: string | null | undefined): Locale {
  const lang = (tag ?? '').toLowerCase().split(/[-_]/)[0];
  if (lang === 'pt') return 'pt-BR';
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

// CLDR cardinals for our languages: French and Portuguese count 0 and 1 as "one".
export function pluralCategory(locale: Locale, n: number): 'one' | 'other' {
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
