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
    setLanguage('it');
    expect(t('you.language')).toBe('Lingua');
    setLanguage('ja');
    expect(t('you.language')).toBe('言語');
    setLanguage('ko');
    expect(t('you.language')).toBe('언어');
    setLanguage('zh-Hans');
    expect(t('you.language')).toBe('语言');
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

  it('counts like English in Italian, and has one form in Japanese, Korean and Chinese', () => {
    expect(pluralCategory('it', 1)).toBe('one');
    expect(pluralCategory('it', 0)).toBe('other');
    expect(pluralCategory('it', 2)).toBe('other');
    for (const locale of ['ja', 'ko', 'zh-Hans'] as const) {
      expect(pluralCategory(locale, 0)).toBe('other');
      expect(pluralCategory(locale, 1)).toBe('other');
      expect(pluralCategory(locale, 5)).toBe('other');
    }
    expect(translate('it', 'library.free.left', { count: 1 })).toBe('1 video gratuito rimasto');
    expect(translate('it', 'library.free.left', { count: 3 })).toBe('3 video gratuiti rimasti');
    expect(translate('ja', 'library.free.left', { count: 1 })).toBe('無料動画 残り1本');
    expect(translate('ko', 'you.autoDelete.days', { count: 1 })).toBe('1일');
    expect(translate('zh-Hans', 'you.autoDelete.days', { count: 7 })).toBe('7 天');
  });
});

describe('languages', () => {
  it('maps a device tag to a supported language, English otherwise', () => {
    expect(resolveLocale('es-MX')).toBe('es');
    expect(resolveLocale('pt-PT')).toBe('pt-BR');
    expect(resolveLocale('de_AT')).toBe('de');
    expect(resolveLocale('it-CH')).toBe('it');
    expect(resolveLocale('ja-JP')).toBe('ja');
    expect(resolveLocale('ko_KR')).toBe('ko');
    expect(resolveLocale('nl-NL')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('gives Simplified Chinese to Hans, CN, SG and bare zh, and English to Traditional', () => {
    expect(resolveLocale('zh-Hans')).toBe('zh-Hans');
    expect(resolveLocale('zh-Hans-CN')).toBe('zh-Hans');
    expect(resolveLocale('zh_Hans_HK')).toBe('zh-Hans');
    expect(resolveLocale('zh-CN')).toBe('zh-Hans');
    expect(resolveLocale('zh-SG')).toBe('zh-Hans');
    expect(resolveLocale('zh')).toBe('zh-Hans');
    expect(resolveLocale('zh-Hant')).toBe('en');
    expect(resolveLocale('zh-Hant-TW')).toBe('en');
    expect(resolveLocale('zh-Hant-CN')).toBe('en');
    expect(resolveLocale('zh-TW')).toBe('en');
    expect(resolveLocale('zh-HK')).toBe('en');
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
    expect(formatNumber(1.5, 'it')).toBe('1,5');
    expect(formatNumber(102.5, 'ja')).toBe('102.5');
    expect(formatDate(d, { month: 'short', timeZone: 'UTC' }, 'it')).toBe('ott');
    expect(formatDate(d, { month: 'short', timeZone: 'UTC' }, 'ja')).toBe('10月');
    expect(formatDate(d, { month: 'short', timeZone: 'UTC' }, 'ko')).toBe('10월');
    expect(formatDate(d, { month: 'short', timeZone: 'UTC' }, 'zh-Hans')).toBe('10月');
    expect(translate('ja', 'library.date.dayMonth', { day: 3, month: '10月' })).toBe('10月3日');
    expect(translate('ko', 'library.date.dayMonth', { day: 3, month: '10월' })).toBe('10월 3일');
    expect(translate('zh-Hans', 'library.date.dayMonth', { day: 3, month: '10月' })).toBe('10月3日');
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

  it.each(LOCALES.filter((l) => l !== 'en'))('%s has no emoji, em dash or banned claim', (locale) => {
    for (const [key, value] of Object.entries(CATALOGUES[locale])) {
      const text = typeof value === 'string' ? value : `${value.one} ${value.other}`;
      expect(`${key}: ${/[\u2014\u2015]|\p{Extended_Pictographic}/u.test(text)}`).toBe(`${key}: false`);
      expect(`${key}: ${/prevent injur|diagnos|診断|怪我を防|진단|부상 방지|诊断|预防受伤|infortun/i.test(text)}`).toBe(`${key}: false`);
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
    expect(Object.keys(rules.CUES)).toHaveLength(22);
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
    expect(cueAlternates('jump_forward', 'it')[1]).toBe('Resta dietro la linea');
    expect(cueAlternates('jump_forward', 'ja')[1]).toBe('線の後ろにとどまる');
    expect(cueAlternates('jump_forward', 'ko')[1]).toBe('선 뒤에 머물러요');
    expect(cueAlternates('jump_forward', 'zh-Hans')[1]).toBe('留在线后面');
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

  it('fills the measurement and the side in the new languages', () => {
    expect(cueWhy('jump_forward', 'Your feet landed 9 cm in front of where they started.', 'it')).toBe(
      'I piedi sono atterrati 9 cm davanti al punto di partenza.'
    );
    expect(cueWhy('chicken_wing', 'Your left elbow crossed the bar 120 ms behind the other.', 'ja')).toBe(
      '左肘がもう一方より120 ms遅れてバーを越えました。'
    );
    expect(cueWhy('chicken_wing', 'Your right elbow crossed the bar 120 ms behind the other.', 'ko')).toBe(
      '오른쪽 팔꿈치가 다른 쪽보다 120 ms 늦게 바를 넘었어요.'
    );
    expect(cueWhy('chicken_wing', 'Your left elbow crossed the bar 120 ms behind the other.', 'zh-Hans')).toBe(
      '你的左肘比另一侧晚 120 ms 过杠。'
    );
  });

  it('keeps the English when the fault or wording is not one we translated', () => {
    expect(cueText('bar_drift_knee', 'Keep the bar close.', 'es')).toBe('Keep the bar close.');
    expect(cueText('hips_rise_early', 'Reworded cue.', 'es')).toBe('Reworded cue.');
    expect(cueWhy('jump_forward', 'Something else entirely.', 'de')).toBe('Something else entirely.');
    expect(cueText('hips_rise_early', 'Push the floor down, chest comes up.', 'en')).toBe('Push the floor down, chest comes up.');
  });
});
