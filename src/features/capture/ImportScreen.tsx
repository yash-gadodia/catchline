import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Movement } from '../../analysis/types';
import Btn from '../../components/Btn';
import { colors, radius, space, stroke } from '../../design/tokens';
import { fontFamily, type } from '../../design/typography';
import ClipPlayer from './ClipPlayer';
import { Header, LiftChip, Meta, Underlined } from './hud';
import LiftSheet from './LiftSheet';
import { clipMeta } from './ReviewScreen';
import { TOO_LONG_S } from './session';
import { repOptions, setStrip } from './sets';
import type { Clip } from './store';
import { t } from '../../i18n';

export default function ImportScreen({
  clip,
  onCancel,
  onMovement,
  onTrim,
  onSet,
  onRep,
  onAnalyse,
}: {
  clip: Clip;
  onCancel: () => void;
  onMovement: (m: Movement) => void;
  onTrim: () => void;
  onSet: (index: number) => void;
  onRep: (rep: number | 'all') => void;
  onAnalyse: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [picking, setPicking] = useState(false);
  const set = clip.sets[clip.setIndex];
  const many = clip.sets.length > 1;
  const reps = set ? set.reps : clip.repsFound;
  const trim = set ? { start: set.start, end: set.end } : clip.trim;

  return (
    <View testID="import-screen" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onCancel} testID="import-cancel">{t('capture.import.cancel')}</Underlined>}
        center={<Text style={[type.button, { color: colors.text }]}>{t('capture.import.title')}</Text>}
        right={<Meta testID="import-meta">{clipMeta({ ...clip, repsFound: null })}</Meta>}
      />
      <ClipPlayer uri={clip.uri} trim={trim} durationS={clip.durationS} width={width} height={Math.min(Math.round(width * 0.97), 380)} progress={false} />
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s4, gap: space.s3 }}>
        {many ? (
          <>
            <Text style={[type.callout, { color: colors.text2 }]}>
              {t('capture.import.longSets', { count: clip.sets.length })}
            </Text>
            <View style={{ height: 64, flexDirection: 'row', gap: 2 }} testID="set-strip">
              {setStrip(clip.sets, clip.durationS).map((c, i) => {
                if (c.kind === 'gap') return <View key={i} style={{ flex: c.seconds, backgroundColor: colors.surface2 }} />;
                const on = c.index === clip.setIndex;
                const r = clip.sets[c.index].reps;
                return (
                  <Pressable
                    key={i}
                    testID={`set-${c.index + 1}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => onSet(c.index)}
                    style={{
                      flex: c.seconds,
                      backgroundColor: colors.hairline,
                      borderWidth: on ? 3 : 0,
                      borderColor: colors.flare,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[type.caption, { color: on ? colors.text : colors.text2 }]}
                    >
                      {on && r ? t('capture.import.setReps', { n: c.index + 1, count: r }) : t('capture.import.set', { n: c.index + 1 })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : clip.durationS > TOO_LONG_S ? (
          <Text style={[type.callout, { color: colors.text2 }]}>
            {t('capture.import.longTrim')}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <LiftChip movement={clip.movement} onPress={() => setPicking(true)} />
          <Underlined onPress={onTrim} testID="import-trim">
            {t('capture.import.adjustTrim')}
          </Underlined>
        </View>
        <View style={{ gap: space.s2 }}>
          <Text style={[type.callout, { color: colors.text2 }]}>{t('capture.import.whichRep')}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[...repOptions(reps), 'all' as const].map((r) => {
              const on = clip.rep === r;
              return (
                <Pressable
                  key={r}
                  testID={`rep-${r}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => onRep(r)}
                  style={{
                    flex: r === 'all' ? 1.6 : 1,
                    height: 44,
                    borderWidth: stroke.hairline,
                    borderColor: on ? colors.text : colors.hairline,
                    borderRadius: radius.control,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text
                    style={{ color: colors.text, fontFamily: on ? fontFamily.bodyMedium : fontFamily.body, fontSize: 15, lineHeight: 20 }}
                  >
                    {r === 'all' ? t('capture.import.all') : String(r)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2 }}>
        <Btn onPress={onAnalyse} testID="import-analyse">
          {many ? t('capture.import.analyseSet', { n: clip.setIndex + 1 }) : t('capture.import.analyse')}
        </Btn>
      </View>
      {picking ? (
        <LiftSheet
          value={clip.movement}
          onPick={(m) => {
            onMovement(m);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}

// The picker was cancelled (or failed): pick again, or record instead.
export function ImportEmpty({ onPick, onRecord, onCancel }: { onPick: () => void; onRecord: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View testID="import-empty" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <Header
        left={<Underlined onPress={onCancel} testID="import-cancel">{t('capture.import.cancel')}</Underlined>}
        center={<Text style={[type.button, { color: colors.text }]}>{t('capture.import.title')}</Text>}
        right={<View style={{ minWidth: 60 }} />}
      />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter, gap: space.s3 }}>
        <Text style={[type.title, { color: colors.text }]}>{t('capture.import.emptyTitle')}</Text>
        <Text style={[type.body, { color: colors.text2 }]}>
          {t('capture.import.emptyBody')}
        </Text>
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s3 }}>
        <Btn onPress={onPick} testID="import-pick">
          {t('capture.import.pick')}
        </Btn>
        <Btn kind="secondary" onPress={onRecord} testID="import-record">
          {t('capture.import.record')}
        </Btn>
      </View>
    </View>
  );
}
