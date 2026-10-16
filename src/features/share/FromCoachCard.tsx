import { Text, View } from 'react-native';
import Btn from '../../components/Btn';
import SmallCaps from '../../components/SmallCaps';
import { colors, radius, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import type { CoachOverride } from './coachRepository';
import { formatDate, getLocale, t } from '../../i18n';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function overrideDateLabel(createdAt: string, now: Date): string {
  const d = new Date(createdAt);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return t('share.coach.today');
  if (getLocale() !== 'en') return formatDate(d, { day: 'numeric', month: 'short' }).toLowerCase();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// The coach's word outranks the app's: the override replaces the cue and the
// app keeps tracking the same measurement against it.
export default function FromCoachCard({
  override,
  onTry,
  now = new Date(),
}: {
  override: CoachOverride;
  onTry: () => void;
  now?: Date;
}) {
  return (
    <View
      testID="from-coach"
      style={{ gap: space.s3, padding: space.s4, borderWidth: 1, borderColor: colors.text, borderRadius: radius.control }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s2 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.flare }} />
          <SmallCaps size={12} color={colors.text}>{t('share.coach.from', { name: override.coachName })}</SmallCaps>
        </View>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
          {overrideDateLabel(override.createdAt, now)}
        </Text>
      </View>
      <Text testID="coach-cue" style={[display(30), { color: colors.text }]}>
        {override.text}
      </Text>
      <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
        {t('share.coach.replaces', { cue: override.replacedCue, metric: override.metricLabel.toLowerCase() })}
      </Text>
      <Btn compact onPress={onTry} testID="coach-try">
        {t('share.coach.try')}
      </Btn>
    </View>
  );
}

export function ReplacedCueRow({ override, sessions }: { override: CoachOverride; sessions: number }) {
  return (
    <View
      testID="replaced-cue"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
        gap: space.s3,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>{override.replacedCue}</Text>
        <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18 }}>
          {t('share.coach.replacedBy', { count: sessions })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.text3 }} />
        <Text style={{ color: colors.text3, fontFamily: fontFamily.bodyMedium, fontSize: 13, lineHeight: 18 }}>{t('share.coach.dropped')}</Text>
      </View>
    </View>
  );
}
