import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Movement } from '../../analysis/types';
import Btn from '../../components/Btn';
import Segmented from '../../components/Segmented';
import SmallCaps from '../../components/SmallCaps';
import { colors, control, radius, space, stroke } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { FOCUS, GROUPS, SOON, liftsIn } from './lifts';
import type { Units } from './store';

export type LiftPick = { lifts: Movement[]; focus: string[]; units: Units };

export default function LiftPickerScreen({
  initial,
  onContinue,
  onSkip,
}: {
  initial: LiftPick;
  onContinue: (pick: LiftPick) => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [lifts, setLifts] = useState<Movement[]>(initial.lifts);
  const [focus, setFocus] = useState<string[]>(initial.focus);
  const [units, setUnits] = useState<Units>(initial.units);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <View testID="lift-picker" style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s5 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.s4, paddingBottom: space.s4 }}>
        <View style={{ gap: 6 }}>
          <Text style={[display(36), { color: colors.text }]}>What are you working on?</Text>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
            Pick as many as you like. Change it later in You.
          </Text>
        </View>
        {GROUPS.map((g) => (
          <View key={g.id} style={{ gap: space.s2 }} testID={`group-${g.id}`}>
            <SmallCaps size={12}>{g.label}</SmallCaps>
            <View style={{ flexDirection: 'row', gap: space.s2 }}>
              {liftsIn(g.id).map((l) => {
                const on = lifts.includes(l.id);
                return (
                  <Pressable
                    key={l.id}
                    testID={`lift-${l.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => setLifts((x) => toggle(x, l.id))}
                    style={{
                      flex: 1,
                      minHeight: 96,
                      borderWidth: on ? stroke.outline : stroke.hairline,
                      borderColor: on ? colors.text : colors.hairline,
                      borderRadius: radius.control,
                      paddingVertical: space.s3,
                      paddingHorizontal: 10,
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 20 }}
                    >
                      {l.name}
                    </Text>
                    <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>{l.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          {SOON.map((name) => (
            <View
              key={name}
              testID="lift-soon"
              accessibilityState={{ disabled: true }}
              style={{
                flex: 1,
                minHeight: 64,
                borderWidth: stroke.hairline,
                borderStyle: 'dashed',
                borderColor: colors.hairline,
                borderRadius: radius.control,
                paddingVertical: 10,
                paddingHorizontal: 10,
                justifyContent: 'space-between',
                gap: 4,
              }}
            >
              <Text numberOfLines={2} style={{ color: colors.text3, fontFamily: fontFamily.bodyBold, fontSize: 15, lineHeight: 18 }}>
                {name}
              </Text>
              <Text style={{ color: colors.text3, fontFamily: fontFamily.mono, fontSize: 11, lineHeight: 14 }}>soon</Text>
            </View>
          ))}
        </View>
        <View style={{ gap: space.s2 }}>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
            Anything specific? <Text style={{ color: colors.text3 }}>Optional</Text>
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {FOCUS.map((f) => {
              const on = focus.includes(f);
              return (
                <Pressable
                  key={f}
                  testID={`focus-${f}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => setFocus((x) => toggle(x, f))}
                  style={{
                    height: control.chipHeight,
                    paddingHorizontal: 10,
                    borderWidth: stroke.hairline,
                    borderColor: on ? colors.text : colors.hairline,
                    borderRadius: radius.control,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}>{f}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>Units</Text>
          <Segmented
            testID="units"
            value={units}
            onChange={setUnits}
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
          />
        </View>
      </ScrollView>
      <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s2, paddingBottom: Math.max(insets.bottom, space.s4) + space.s2, gap: space.s4 }}>
        <Btn onPress={() => onContinue({ lifts, focus, units })} testID="lifts-continue">
          Continue
        </Btn>
        <Btn kind="text" onPress={onSkip} testID="lifts-skip" style={{ alignSelf: 'center' }}>
          Skip
        </Btn>
      </View>
    </View>
  );
}
