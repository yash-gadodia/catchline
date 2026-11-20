import { Text, View } from 'react-native';
import Btn from '../../components/Btn';
import { colors, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { t } from '../../i18n';

// path: the bar path was drawn. trail: a hanging movement's hip trail. none: a lift with no bar path (the plate was
// not clear). sample: the bundled lift, opened before the lifter has one of their own.
export type FirstLookKind = 'path' | 'trail' | 'none' | 'sample';

// What a new lift opens on once its first look has played: the one number, then what to do next. The player's
// controls and chart are under "See the detail". A lift with no bar path says why and how to film the next one.
export default function FirstLook({
  kind,
  first,
  peak,
  free,
  bottomInset,
  onShare,
  onDetail,
  onAnother,
  onTell,
}: {
  kind: FirstLookKind;
  // the lifter's first lift: said once
  first: boolean;
  // peak bar speed in m/s, when the lift has one
  peak: number | null;
  // a free lifter is told a lift with no bar path left their weekly video untouched
  free: boolean;
  bottomInset: number;
  onShare?: () => void;
  onDetail: () => void;
  onAnother?: () => void;
  // the feedback form, where the lifter can also leave an email for a reply
  onTell?: () => void;
}) {
  const number =
    peak === null ? null : (
      <View>
        <Text testID="first-look-peak" style={[display(72), { color: colors.text }]}>
          {peak.toFixed(2)}
          <Text style={[display(28), { color: colors.flare }]}> m/s</Text>
        </Text>
        <Text style={{ ...type.callout, color: colors.text2 }}>{t('analysis.reveal.peak')}</Text>
      </View>
    );
  return (
    <View testID="first-look" style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: Math.max(bottomInset, space.s4), justifyContent: 'space-between', gap: space.s4 }}>
      {kind === 'none' ? (
        <View style={{ gap: space.s2 }}>
          <Text style={{ ...type.title, color: colors.text }}>{t('analysis.reveal.none.title')}</Text>
          <Text style={{ ...type.callout, color: colors.text2 }}>{t('analysis.reveal.none.why')}</Text>
          {([1, 2, 3] as const).map((n) => (
            <View key={n} style={{ flexDirection: 'row', gap: space.s3 }}>
              <Text style={{ ...type.callout, color: colors.flare }}>{n}</Text>
              <Text style={{ ...type.callout, color: colors.text, flex: 1 }}>{t(`analysis.reveal.none.tip${n}`)}</Text>
            </View>
          ))}
          {free ? <Text testID="first-look-not-counted" style={{ ...type.callout, color: colors.text2 }}>{t('analysis.tracker.notCounted')}</Text> : null}
        </View>
      ) : kind === 'sample' ? (
        <View style={{ gap: space.s2 }}>
          <Text style={{ ...type.title, color: colors.text }}>{t('analysis.reveal.sample.title')}</Text>
          {number}
          <Text style={{ ...type.callout, color: colors.text2 }}>{t('analysis.reveal.sample.body')}</Text>
        </View>
      ) : (
        <View style={{ gap: space.s2 }}>
          {first && kind === 'path' ? <Text testID="first-look-first" style={{ ...type.label, color: colors.text2 }}>{t('analysis.reveal.first')}</Text> : null}
          {number}
        </View>
      )}
      <View style={{ gap: space.s2 }}>
        {kind === 'none' || kind === 'sample' ? (
          onAnother ? (
            <Btn onPress={onAnother} testID="first-look-another">
              {t(kind === 'sample' ? 'analysis.reveal.sample.own' : 'analysis.reveal.none.retry')}
            </Btn>
          ) : null
        ) : onShare ? (
          <Btn onPress={onShare} testID="first-look-share">
            {t('analysis.player.share')}
          </Btn>
        ) : null}
        <Btn kind="secondary" compact onPress={onDetail} testID="first-look-detail">
          {t(kind === 'none' ? 'analysis.reveal.none.body' : 'analysis.reveal.detail')}
        </Btn>
        {(kind === 'path' || kind === 'trail') && onAnother ? (
          <Btn kind="text" onPress={onAnother} testID="first-look-another">
            {t('analysis.reveal.another')}
          </Btn>
        ) : null}
        {first && kind !== 'sample' && onTell ? (
          <Btn kind="text" onPress={onTell} testID="first-look-tell">
            {t('analysis.reveal.tell')}
          </Btn>
        ) : null}
      </View>
    </View>
  );
}
