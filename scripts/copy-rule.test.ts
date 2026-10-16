import { check } from './design-guard';
import { rawCopy } from './copy-rule';

const SCREEN = 'src/features/library/Fixture.tsx';

describe('check-raw-copy', () => {
  it('passes t() calls, punctuation and non-copy props', () => {
    const src = [
      `const a = <Text style={s}>{t('you.language')}</Text>;`,
      `const b = <Row title={t('you.language')} testID="row-language" right={<Value>›</Value>} />;`,
      `const c = <Text>{' · '}{count}</Text>;`,
      `const d = <Icon name="chevron" accessibilityRole="button" />;`,
    ].join('\n');
    expect(check(rawCopy, src, SCREEN)).toEqual([]);
  });

  it('fails JSX text, copy props and string children', () => {
    const src = [
      `const a = <Text>Delete lift</Text>;`,
      `const b = <Row title="Units" />;`,
      `const c = <Btn label={busy ? 'Saving' : t('you.language')} />;`,
      `const d = <Text>{\`\${n} reps\`}</Text>;`,
      `const e = <Field placeholder={'Your name'} />;`,
    ].join('\n');
    expect(check(rawCopy, src, SCREEN)).toEqual([1, 2, 3, 4, 5]);
  });

  it('lets a line opt out with i18n-ok', () => {
    const src = [`// i18n-ok: brand name`, `const a = <Text>Catchline</Text>;`, `const b = <Text>RevenueCat</Text>; // i18n-ok: vendor`].join('\n');
    expect(check(rawCopy, src, SCREEN)).toEqual([]);
  });

  it('covers app/ and src/features/, not tests, atoms or dev screens', () => {
    expect(rawCopy.applies('app/(tabs)/me.tsx')).toBe(true);
    expect(rawCopy.applies('src/features/you/YouScreen.tsx')).toBe(true);
    expect(rawCopy.applies('src/features/you/you.test.tsx')).toBe(false);
    expect(rawCopy.applies('src/components/Btn.tsx')).toBe(false);
    expect(rawCopy.applies('app/dev/design.tsx')).toBe(false);
    expect(rawCopy.applies('app/paywall/dev.tsx')).toBe(false);
  });
});
