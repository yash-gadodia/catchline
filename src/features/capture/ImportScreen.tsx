import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Movement } from '../../analysis/types';
import Btn from '../../components/Btn';
import { colors, radius, space, stroke } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import ClipPlayer from './ClipPlayer';
import { Header, LiftChip, Meta, Underlined } from './hud';
import LiftSheet from './LiftSheet';
import { clipMeta } from './ReviewScreen';
import { TOO_LONG_S } from './session';
import { repOptions, setStrip } from './sets';
import type { Clip } from './store';

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
        left={<Underlined onPress={onCancel} testID="import-cancel">Cancel</Underlined>}
        center={<Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>Import</Text>}
        right={<Meta testID="import-meta">{clipMeta({ ...clip, repsFound: null })}</Meta>}
      />
      <ClipPlayer uri={clip.uri} trim={trim} durationS={clip.durationS} width={width} height={Math.min(Math.round(width * 0.97), 380)} progress={false} />
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s4, gap: space.s3 }}>
        {many ? (
          <>
            <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
              {`Long clip. We found ${clip.sets.length} sets; pick one.`}
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
                      style={{ color: on ? colors.text : colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}
                    >
                      {on && r ? `set ${c.index + 1} · ${r} reps` : `set ${c.index + 1}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : clip.durationS > TOO_LONG_S ? (
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
            Long clip. Trim it to the one set you want looked at.
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <LiftChip movement={clip.movement} onPress={() => setPicking(true)} />
          <Underlined onPress={onTrim} testID="import-trim">
            Adjust trim
          </Underlined>
        </View>
        <View style={{ gap: space.s2 }}>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>Which rep?</Text>
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
                    {r === 'all' ? 'All' : String(r)}
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
          {many ? `Analyse set ${clip.setIndex + 1}` : 'Analyse'}
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
        left={<Underlined onPress={onCancel} testID="import-cancel">Cancel</Underlined>}
        center={<Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>Import</Text>}
        right={<View style={{ minWidth: 60 }} />}
      />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: space.gutter, gap: space.s3 }}>
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>No video picked</Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
          Pick one set filmed from the side, whole body and bar in frame.
        </Text>
      </View>
      <View style={{ paddingHorizontal: space.gutter, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s3 }}>
        <Btn onPress={onPick} testID="import-pick">
          Choose a video
        </Btn>
        <Btn kind="secondary" onPress={onRecord} testID="import-record">
          Record instead
        </Btn>
      </View>
    </View>
  );
}
