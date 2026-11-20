import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Text from '../../components/Text';
import Btn from '../../components/Btn';
import { colors, control, shape, space, stroke } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { t } from '../../i18n';
import type { NoPathCause } from '../../analysis/types';
import { kindChoices, kindIdOf, kindLabel, ownKinds, pickLiftKind, useLiftNames } from '../library/liftNames';
import FadeRow from './FadeRow';

// path: the bar path was drawn. trail: a hanging movement's hip trail. none: a lift with no bar path (the plate was
// not clear). sample: the bundled lift, opened before the lifter has one of their own.
export type FirstLookKind = 'path' | 'trail' | 'none' | 'sample';

// What a new lift opens on once its first look has played: the one number, then what to do next. The player's
// controls and chart are under "See the detail". A lift with no bar path says why and how to film the next one.
export default function FirstLook({
  kind,
  cause,
  first,
  peak,
  free,
  bottomInset,
  onShare,
  onDetail,
  onAnother,
  onTell,
  liftId,
  onMoreKinds,
  onNeed,
}: {
  kind: FirstLookKind;
  // why a lift with no bar path has none, when the tracker recorded it: that cause and its one fix in place of the
  // general tips
  cause?: NoPathCause;
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
  // the lift the card asks the kind of (never the sample), and where "More" goes: the lift's details
  liftId?: string;
  onMoreKinds?: () => void;
  // the height the card needs, once measured: the video above gives it that room on a small phone
  onNeed?: (height: number) => void;
}) {
  const [parts, setParts] = useState({ top: 0, bottom: 0 });
  const padBottom = Math.max(bottomInset, space.s4);
  useEffect(() => {
    if (parts.top > 0 && parts.bottom > 0) onNeed?.(space.s4 + parts.top + space.s4 + parts.bottom + padBottom);
  }, [parts.top, parts.bottom, padBottom]);
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
    <View testID="first-look" style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: padBottom, justifyContent: 'space-between', gap: space.s4 }}>
      <View testID="first-look-top" onLayout={(e) => setParts((p) => ({ ...p, top: e.nativeEvent.layout.height }))}>
      {kind === 'none' ? (
        <View style={{ gap: space.s2 }}>
          <Text style={{ ...type.title, color: colors.text }}>{t('analysis.reveal.none.title')}</Text>
          {cause ? (
            <>
              <Text testID="first-look-why" style={{ ...type.callout, color: colors.text2 }}>
                {t(`analysis.reveal.none.${cause.cause}.why`, { deg: cause.offSideDeg ?? '' })}
              </Text>
              <Text testID="first-look-fix" style={{ ...type.callout, color: colors.text }}>{t(`analysis.reveal.none.${cause.cause}.fix`)}</Text>
            </>
          ) : (
            <>
              <Text style={{ ...type.callout, color: colors.text2 }}>{t('analysis.reveal.none.why')}</Text>
              {([1, 2, 3] as const).map((n) => (
                <View key={n} style={{ flexDirection: 'row', gap: space.s3 }}>
                  <Text style={{ ...type.callout, color: colors.flare }}>{n}</Text>
                  <Text style={{ ...type.callout, color: colors.text, flex: 1 }}>{t(`analysis.reveal.none.tip${n}`)}</Text>
                </View>
              ))}
            </>
          )}
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
          {kind === 'trail' ? (
            // a hanging movement has no bar, so no bar speed: say what is drawn instead of leaving the space empty (#239)
            <View testID="first-look-trail" style={{ gap: space.s2 }}>
              <Text style={{ ...type.title, color: colors.text }}>{t('analysis.reveal.trail.title')}</Text>
              <Text style={{ ...type.callout, color: colors.text2 }}>{t('analysis.reveal.trail.body')}</Text>
            </View>
          ) : null}
        </View>
      )}
      </View>
      <View testID="first-look-bottom" onLayout={(e) => setParts((p) => ({ ...p, bottom: e.nativeEvent.layout.height }))} style={{ gap: space.s2 }}>
        {kind !== 'sample' && liftId ? <KindRow liftId={liftId} trace={kind} onMore={onMoreKinds} /> : null}
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

const chip = {
  height: control.chipHeight,
  paddingHorizontal: space.s3,
  justifyContent: 'center',
  borderWidth: stroke.hairline,
  ...shape.control,
} as const;

// "What was this lift?": one tap names it, a second tap on the lifter's pick clears it, as on the details. The kind
// the app read is selected from the start. More opens the details, with every kind and a field for their own words.
function KindRow({ liftId, trace, onMore }: { liftId: string; trace: 'path' | 'trail' | 'none'; onMore?: () => void }) {
  const current = useLiftNames((n) => kindIdOf(n, liftId));
  const picked = useLiftNames((n) => n.chosen[liftId] !== undefined);
  const chosen = useLiftNames((n) => n.chosen);
  const kinds = kindChoices(trace, current, ownKinds(chosen));
  return (
    // the row runs to the screen's edges, and the card's gutter is inside it
    <View style={{ marginHorizontal: -space.gutter, marginBottom: space.s2 }}>
      <FadeRow testID="first-look-kinds" contentContainerStyle={{ gap: space.s2, paddingHorizontal: space.gutter, alignItems: 'center' }}>
        <Text style={{ ...type.small, color: colors.text2 }}>{t('analysis.reveal.kind.ask')}</Text>
        {kinds.map((k) => {
          const on = current === k;
          return (
            <Pressable
              key={k}
              onPress={() => pickLiftKind(liftId, on && picked ? null : k)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              hitSlop={2}
              testID={`first-look-kind-${k}`}
              style={[chip, { borderColor: on ? colors.text : colors.hairline }]}
            >
              <Text style={{ ...type.caption, color: on ? colors.text : colors.text2 }}>{kindLabel(k)}</Text>
            </Pressable>
          );
        })}
        {onMore ? (
          <Pressable onPress={onMore} accessibilityRole="button" hitSlop={2} testID="first-look-kind-more" style={[chip, { borderColor: colors.hairline }]}>
            <Text style={{ ...type.caption, color: colors.text2 }}>{t('analysis.reveal.kind.more')}</Text>
          </Pressable>
        ) : null}
      </FadeRow>
    </View>
  );
}
