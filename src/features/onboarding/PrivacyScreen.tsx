import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';
import { Checkbox, GateBtn, Title } from './ui';
import { t } from '../../i18n';

export function privacyPoints(): string[] {
  return [
    t('onboarding.privacy.faces'),
    t('onboarding.privacy.deleted'),
    t('onboarding.privacy.estimate'),
  ];
}

const small = { ...type.callout };

export default function PrivacyScreen({
  initialImprove,
  onContinue,
}: {
  initialImprove: boolean;
  onContinue: (improveAccuracy: boolean) => void;
}) {
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false);
  const [improve, setImprove] = useState(initialImprove);
  return (
    <View testID="privacy-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s7 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.s5, paddingBottom: space.s4 }}>
        <Title>{t('onboarding.privacy.title')}</Title>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {privacyPoints().map((p) => (
            <View key={p} style={{ paddingVertical: space.s4, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <Text style={{ color: colors.text, ...type.body }}>{p}</Text>
            </View>
          ))}
        </View>
        <Checkbox checked={agreed} onToggle={() => setAgreed((v) => !v)} testID="consent-required">
          <Text style={[small, { color: colors.text }]}>
            {t('onboarding.privacy.agree')} <Text style={{ color: colors.text2 }}>{t('onboarding.privacy.required')}</Text>
          </Text>
        </Checkbox>
        <Checkbox checked={improve} onToggle={() => setImprove((v) => !v)} testID="consent-improve">
          <Text style={[small, { color: colors.text }]}>
            {t('onboarding.privacy.improve')}{' '}
            <Text style={{ color: colors.text2 }}>{t('onboarding.privacy.improveNote')}</Text>
          </Text>
        </Checkbox>
      </ScrollView>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s2, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s4 }}>
        <GateBtn disabled={!agreed} onPress={() => onContinue(improve)} testID="privacy-continue">
          {t('onboarding.privacy.continue')}
        </GateBtn>
        <Text style={{ color: colors.text2, ...type.readout, textAlign: 'center' }}>
          <Text style={{ color: colors.text2 }} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link" testID="link-privacy">
            {t('onboarding.privacy.policy')}
          </Text>
          {' · '}
          <Text style={{ color: colors.text2 }} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link" testID="link-terms">
            {t('onboarding.privacy.terms')}
          </Text>
        </Text>
      </View>
    </View>
  );
}
