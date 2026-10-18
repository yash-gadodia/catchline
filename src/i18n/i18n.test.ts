import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { en } from './en';
import {
  CATALOGUES,
  LOCALES,
  formatDate,
  formatNumber,
  getLocale,
  pluralCategory,
  resolveLocale,
  setLanguage,
  t,
  translate,
  type Catalogue,
  type Locale,
} from './index';
import { cueAlternates, cueText, cueWhy } from './cues';

afterEach(() => setLanguage('en'));

describe('t()', () => {
  it('reads the current language', () => {
    setLanguage('de');
    expect(t('you.language')).toBe('Sprache');
    setLanguage('pt-BR');
    expect(t('you.language')).toBe('Idioma');
  });

  it('falls back to English when a language lacks the key', () => {
    const partial: Record<Locale, Catalogue> = { ...CATALOGUES, fr: {} };
    expect(translate('fr', 'you.language', undefined, partial)).toBe('Language');
  });

  it('fills {vars} and formats numbers for the language', () => {
    const cat: Record<Locale, Catalogue> = { ...CATALOGUES, de: { 'you.language': 'Bar {m} bei {kg} kg' } };
    expect(translate('de', 'you.language', { m: '12 cm', kg: 102.5 }, cat)).toBe('Bar 12 cm bei 102,5 kg');
    expect(translate('en', 'you.language', { kg: 1 }, { ...CATALOGUES, en: { 'you.language': '{kg} kg, {missing}' } })).toBe(
      '1 kg, {missing}'
    );
  });

  it('picks the plural form by language', () => {
    const plural = { one: '{count} rep', other: '{count} reps' };
    const cat: Record<Locale, Catalogue> = { ...CATALOGUES, en: { 'you.language': plural }, fr: { 'you.language': { one: '{count} rép', other: '{count} réps' } } };
    expect(translate('en', 'you.language', { count: 1 }, cat)).toBe('1 rep');
    expect(translate('en', 'you.language', { count: 0 }, cat)).toBe('0 reps');
    expect(translate('fr', 'you.language', { count: 0 }, cat)).toBe('0 rép');
    expect(translate('fr', 'you.language', { count: 2 }, cat)).toBe('2 réps');
    expect(pluralCategory('pt-BR', 1)).toBe('one');
    expect(pluralCategory('de', 0)).toBe('other');
    expect(pluralCategory('es', 1)).toBe('one');
  });
});

describe('languages', () => {
  it('maps a device tag to a supported language, English otherwise', () => {
    expect(resolveLocale('es-MX')).toBe('es');
    expect(resolveLocale('pt-PT')).toBe('pt-BR');
    expect(resolveLocale('de_AT')).toBe('de');
    expect(resolveLocale('ja-JP')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('follows the setting, and System follows the device (en-US in jest)', () => {
    setLanguage('fr');
    expect(getLocale()).toBe('fr');
    setLanguage('system');
    expect(getLocale()).toBe('en');
  });

  it('formats dates and numbers per language', () => {
    const d = new Date(Date.UTC(2026, 9, 3));
    expect(formatDate(d, { day: 'numeric', month: 'short', timeZone: 'UTC' }, 'en')).toBe('Oct 3');
    expect(formatDate(d, { day: 'numeric', month: 'long', timeZone: 'UTC' }, 'de')).toBe('3. Oktober');
    expect(formatNumber(1.5, 'fr')).toBe('1,5');
    expect(formatNumber(1.5, 'en')).toBe('1.5');
  });
});

describe('catalogues', () => {
  const enKeys = Object.keys(en).sort();

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has exactly the English keys, none empty', (locale) => {
    const cat = CATALOGUES[locale];
    expect(Object.keys(cat).sort()).toEqual(enKeys);
    for (const [key, value] of Object.entries(cat)) {
      const forms = typeof value === 'string' ? [value] : [value.one, value.other];
      for (const f of forms) expect(`${key}: ${f.trim().length > 0}`).toBe(`${key}: true`);
    }
  });

  it.each(LOCALES.filter((l) => l !== 'en'))('%s keeps every {var} of the English', (locale) => {
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const flat = (v: unknown) => (typeof v === 'string' ? v : `${(v as { other: string }).other}`);
    for (const key of enKeys) {
      const k = key as keyof typeof en;
      expect(`${key}: ${vars(flat(CATALOGUES[locale][k]))}`).toBe(`${key}: ${vars(flat(en[k]))}`);
    }
  });

  it('prefixes every key with its namespace file', () => {
    const dir = join(__dirname, 'en');
    for (const file of readdirSync(dir).filter((f) => f !== 'index.ts')) {
      const ns = file.replace(/\.ts$/, '');
      const keys = [...readFileSync(join(dir, file), 'utf8').matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]);
      for (const key of keys) expect(`${file}: ${key.startsWith(`${ns}.`)}`).toBe(`${file}: true`);
    }
  });

  it('marks every translated cue file for a native coach review', () => {
    for (const locale of LOCALES.filter((l) => l !== 'en')) {
      const src = readFileSync(join(__dirname, locale, 'cue.ts'), 'utf8');
      expect(src).toMatch(/^\/\/ REVIEW: .*native-speaking/m);
      expect(src).toContain('export const review = true;');
    }
  });
});

describe('cue copy', () => {
  const rules = JSON.parse(readFileSync(join(__dirname, '../../cv/catchline_cv/rules.json'), 'utf8')) as {
    CUES: Record<string, string>;
    WHY: Record<string, string>;
    ALTERNATES: Record<string, { text: string }[]>;
  };

  it('matches the worker cue text and why templates word for word', () => {
    expect(Object.keys(rules.CUES)).toHaveLength(19);
    for (const [id, text] of Object.entries(rules.CUES)) expect(en[`cue.text.${id}` as keyof typeof en]).toBe(text);
    for (const [id, why] of Object.entries(rules.WHY)) expect(en[`cue.why.${id}` as keyof typeof en]).toBe(why);
  });

  it('has an English key for every alternate, word for word, and no stray ones', () => {
    const keys = Object.entries(rules.ALTERNATES).flatMap(([id, alts]) => alts.map((a, i) => [`cue.alt.${id}.${i + 1}`, a.text]));
    for (const [key, text] of keys) expect(`${key}: ${en[key as keyof typeof en]}`).toBe(`${key}: ${text}`);
    expect(Object.keys(en).filter((k) => k.startsWith('cue.alt.')).sort()).toEqual(keys.map(([k]) => k).sort());
  });

  it('shows the alternates in the lifter language', () => {
    expect(cueAlternates('jump_forward', 'en')).toEqual([
      'Jump straight up, not forward',
      'Stay behind the line',
      'Pull the bar into you',
      'Push the floor straight down',
    ]);
    expect(cueAlternates('jump_forward', 'es')[1]).toBe('Quédate detrás de la línea');
    expect(cueAlternates('not_a_fault', 'de')).toEqual([]);
  });

  it('translates a known cue and its why, keeping the measurement', () => {
    expect(cueText('hips_rise_early', 'Push the floor down, chest comes up.', 'es')).toBe('Empuja el suelo, el pecho sube.');
    expect(cueWhy('jump_forward', 'Your feet landed 9 cm in front of where they started.', 'de')).toBe(
      'Deine Füße landeten 9 cm vor ihrer Startposition.'
    );
    expect(cueWhy('chicken_wing', 'Your left elbow crossed the bar 120 ms behind the other.', 'fr')).toBe(
      "Ton coude gauche a passé la barre 120 ms après l'autre."
    );
  });

  it('keeps the English when the fault or wording is not one we translated', () => {
    expect(cueText('bar_drift_knee', 'Keep the bar close.', 'es')).toBe('Keep the bar close.');
    expect(cueText('hips_rise_early', 'Reworded cue.', 'es')).toBe('Reworded cue.');
    expect(cueWhy('jump_forward', 'Something else entirely.', 'de')).toBe('Something else entirely.');
    expect(cueText('hips_rise_early', 'Push the floor down, chest comes up.', 'en')).toBe('Push the floor down, chest comes up.');
  });
});
