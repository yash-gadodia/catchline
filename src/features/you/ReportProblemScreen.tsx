import { useState } from 'react';
import { Image, ScrollView, TextInput, View } from 'react-native';
import Text from '../../components/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import TopBar from '../../components/TopBar';
import { colors, shape, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { queueProblemReport, reportDetails } from '../../data/problemReports';
import { EMAIL_MAX, leaveContactEmail, useContact, validEmail } from '../../data/contact';
import { t } from '../../i18n';
import { EVENTS, track } from '../../lib/analytics';

export const REPORT_MAX = 4000;

export default function ReportProblemScreen({
  liftId,
  context,
  shot,
  back,
  onBack,
}: {
  liftId?: string;
  context?: string;
  shot?: string;
  back: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [result, setResult] = useState<'sent' | 'queued' | null>(null);
  const [email, setEmail] = useState(() => useContact.getState().email);
  const details = reportDetails();
  const feedback = context === 'feedback';
  const send = async () => {
    const sent = await queueProblemReport({ body: text, liftId, context, ...(shot ? { shot } : {}) });
    if (validEmail(email)) void leaveContactEmail(email);
    setResult(sent > 0 ? 'sent' : 'queued');
    if (feedback) track(EVENTS.FEEDBACK_SENT, { chars: text.trim().length });
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="report-problem">
      <TopBar
        back={back}
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, ...type.button }}>{t(feedback ? 'you.shot.give' : 'you.reportProblem')}</Text>}
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.gutter, gap: space.s4 }}>
        {result ? (
          <>
            <Text style={{ color: colors.text, ...type.body }} testID="report-result">
              {t(result === 'sent' ? 'you.report.sent' : 'you.report.queued')}
            </Text>
            <Btn kind="secondary" onPress={onBack} testID="report-done">
              {t('you.report.done')}
            </Btn>
          </>
        ) : (
          <>
            <TextInput
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              maxLength={REPORT_MAX}
              placeholder={t(feedback ? 'you.feedback.placeholder' : 'you.report.placeholder')}
              placeholderTextColor={colors.text3}
              testID="report-input"
              style={{
                minHeight: 160,
                borderWidth: 1,
                borderColor: colors.hairline,
                ...shape.control,
                padding: space.s3,
                color: colors.text,
                fontFamily: fontFamily.body,
                // design-ok: TextInput, a lineHeight shifts the caret and text on iOS
                fontSize: 17,
                textAlignVertical: 'top',
              }}
            />
            <View style={{ gap: space.s1 }}>
              <TextInput
                value={email}
                onChangeText={setEmail}
                maxLength={EMAIL_MAX}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                placeholder={t('you.report.email')}
                placeholderTextColor={colors.text3}
                accessibilityLabel={t('you.report.email')}
                testID="report-email"
                style={{
                  borderWidth: 1,
                  borderColor: colors.hairline,
                  ...shape.control,
                  padding: space.s3,
                  color: colors.text,
                  fontFamily: fontFamily.body,
                  // design-ok: TextInput, a lineHeight shifts the caret and text on iOS
                  fontSize: 17,
                }}
              />
              <Text style={{ color: colors.text2, ...type.small }} testID="report-email-note">
                {t('you.report.emailNote')}
              </Text>
            </View>
            <View style={{ gap: space.s1 }}>
              <Text style={{ color: colors.text2, ...type.small }} testID="report-details">
                {t('you.report.details', { version: details.appVersion, update: details.updateId, device: details.device })}
              </Text>
              {liftId ? (
                <Text style={{ color: colors.text2, ...type.small }} testID="report-lift">
                  {t('you.report.lift', { id: liftId })}
                </Text>
              ) : null}
              <Text style={{ color: colors.text2, ...type.small }} testID="report-attachment">
                {t(shot ? 'you.report.shotAttached' : 'you.report.noVideo')}
              </Text>
            </View>
            {shot ? (
              <Image
                source={{ uri: shot }}
                resizeMode="contain"
                testID="report-shot"
                style={{ height: 120, aspectRatio: 9 / 19.5, borderWidth: 1, borderColor: colors.hairline, ...shape.control }}
              />
            ) : null}
            <Btn onPress={send} disabled={text.trim().length === 0} testID="report-send">
              {t('you.report.send')}
            </Btn>
          </>
        )}
      </ScrollView>
    </View>
  );
}
