import { useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';
import { Checkbox, GateBtn, Title } from './ui';

export const PRIVACY_POINTS = [
  'We measure positions, not faces.',
  'Raw video is deleted within 24 hours. The overlay and numbers stay.',
  'People in the background are blurred.',
  'The cue is an AI estimate, not medical advice.',
];

const small = { fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 };

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
        <Title>What happens to your clip</Title>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          {PRIVACY_POINTS.map((p) => (
            <View key={p} style={{ paddingVertical: space.s4, borderBottomWidth: 1, borderBottomColor: colors.hairline }}>
              <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>{p}</Text>
            </View>
          ))}
        </View>
        <Checkbox checked={agreed} onToggle={() => setAgreed((v) => !v)} testID="consent-required">
          <Text style={[small, { color: colors.text }]}>
            I've read this and I'm over 16. <Text style={{ color: colors.text2 }}>Required.</Text>
          </Text>
        </Checkbox>
        <Checkbox checked={improve} onToggle={() => setImprove((v) => !v)} testID="consent-improve">
          <Text style={[small, { color: colors.text }]}>
            Let Catchline use my clips to improve accuracy.{' '}
            <Text style={{ color: colors.text2 }}>Optional. Change it any time in the You tab.</Text>
          </Text>
        </Checkbox>
      </ScrollView>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s2, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s4 }}>
        <GateBtn disabled={!agreed} onPress={() => onContinue(improve)} testID="privacy-continue">
          Continue
        </GateBtn>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
          <Text style={{ color: colors.text2 }} onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link" testID="link-privacy">
            privacy policy
          </Text>
          {' · '}
          <Text style={{ color: colors.text2 }} onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link" testID="link-terms">
            terms
          </Text>
        </Text>
      </View>
    </View>
  );
}
