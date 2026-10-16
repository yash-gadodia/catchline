// The worker writes cues in English. The app shows them in the lifter's language, keyed by fault id, only when
// the worker's English is exactly the copy we translated; anything else (a new fault, reworded copy) stays English.
import { en } from './en';
import { getLocale, isKey, translate, type Locale } from './index';

const SIDES = ['left', 'right', 'late'] as const;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cueText(faultId: string, english: string, locale: Locale = getLocale()): string {
  const key = `cue.text.${faultId}`;
  if (locale === 'en' || !isKey(key) || en[key] !== english) return english;
  return translate(locale, key);
}

export function cueWhy(faultId: string, english: string, locale: Locale = getLocale()): string {
  const key = `cue.why.${faultId}`;
  if (locale === 'en' || !isKey(key)) return english;
  const template = en[key];
  if (typeof template !== 'string') return english;
  const pattern = escape(template).replace('\\{m\\}', '(.+?)').replace('\\{side\\}', `(${SIDES.join('|')})`);
  const match = new RegExp(`^${pattern}$`).exec(english);
  if (!match) return english;
  const names = ['m', 'side']
    .filter((n) => template.includes(`{${n}}`))
    .sort((a, b) => template.indexOf(`{${a}}`) - template.indexOf(`{${b}}`));
  const found: Record<string, string> = {};
  names.forEach((n, i) => (found[n] = match[i + 1]));
  const vars: Record<string, string> = {};
  if (found.m) vars.m = found.m;
  const side = found.side;
  if (side) {
    const sideKey = `cue.side.${side}`;
    if (isKey(sideKey)) vars.side = translate(locale, sideKey);
  }
  return translate(locale, key, vars);
}
