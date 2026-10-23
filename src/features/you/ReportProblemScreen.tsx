import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import TopBar from '../../components/TopBar';
import { colors, shape, space } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import { queueProblemReport, reportDetails } from '../../data/problemReports';
import { t } from '../../i18n';

export const REPORT_MAX = 4000;

export default function ReportProblemScreen({
  liftId,
  context,
  back,
  onBack,
}: {
  liftId?: string;
  context?: string;
  back: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [result, setResult] = useState<'sent' | 'queued' | null>(null);
  const details = reportDetails();
  const send = async () => {
    const sent = await queueProblemReport({ body: text, liftId, context });
    setResult(sent > 0 ? 'sent' : 'queued');
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} testID="report-problem">
      <TopBar
        back={back}
        onBack={onBack}
        more={false}
        center={<Text style={{ color: colors.text, ...type.button }}>{t('you.reportProblem')}</Text>}
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
              placeholder={t('you.report.placeholder')}
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
              <Text style={{ color: colors.text2, ...type.small }} testID="report-details">
                {t('you.report.details', { version: details.appVersion, update: details.updateId, device: details.device })}
              </Text>
              {liftId ? (
                <Text style={{ color: colors.text2, ...type.small }} testID="report-lift">
                  {t('you.report.lift', { id: liftId })}
                </Text>
              ) : null}
              <Text style={{ color: colors.text2, ...type.small }}>{t('you.report.noVideo')}</Text>
            </View>
            <Btn onPress={send} disabled={text.trim().length === 0} testID="report-send">
              {t('you.report.send')}
            </Btn>
          </>
        )}
      </ScrollView>
    </View>
  );
}
