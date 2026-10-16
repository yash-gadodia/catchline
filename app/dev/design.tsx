import { useState, type ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../src/components/Btn';
import Mark from '../../src/components/Mark';
import Readout from '../../src/components/Readout';
import ListRow from '../../src/components/Row';
import Segmented from '../../src/components/Segmented';
import Sheet from '../../src/components/Sheet';
import SmallCaps from '../../src/components/SmallCaps';
import TopBar from '../../src/components/TopBar';
import {
  colors,
  control,
  dark,
  light,
  motion,
  opacity,
  radius,
  shade,
  shape,
  space,
  stroke,
  strobe,
  type Palette,
} from '../../src/design/tokens';
import { display, type } from '../../src/design/typography';

// Dev-only catalogue (catchline://dev/design): every token and atom state on one scroll, so drift
// shows at a glance. Built only from tokens and atoms, so the design guards hold it to zero.
const SWATCH = 44;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.s3, paddingTop: space.s6 }}>
      <SmallCaps>{title}</SmallCaps>
      {children}
    </View>
  );
}

function Caption({ children }: { children: string }) {
  return <Text style={[type.caption, { color: colors.text3 }]}>{children}</Text>;
}

function Swatches({ palette }: { palette: Palette }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s3 }}>
      {(Object.keys(palette) as (keyof Palette)[]).map((role) => (
        <View key={role} style={{ width: 72, gap: space.s1 }}>
          <View
            style={{
              height: SWATCH,
              backgroundColor: palette[role],
              borderWidth: stroke.hairline,
              borderColor: colors.hairline,
              ...shape.control,
            }}
          />
          <Caption>{role}</Caption>
          <Caption>{palette[role]}</Caption>
        </View>
      ))}
    </View>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s3, flexWrap: 'wrap' }}>{children}</View>;
}

export default function DesignCatalogue() {
  const insets = useSafeAreaInsets();
  const [seg, setSeg] = useState<'snatch' | 'clean' | 'jerk'>('snatch');
  const [mono, setMono] = useState<'30d' | '90d' | 'all'>('30d');
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <ScrollView
      testID="design-catalogue"
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s5, paddingHorizontal: space.gutter, paddingBottom: space.s8 }}
    >
      <SmallCaps>Dev · design system</SmallCaps>
      <Text style={[display(56), { color: colors.text, marginTop: space.s2 }]}>Catchline</Text>
      <Text style={[type.callout, { color: colors.text2, marginTop: space.s2 }]}>
        Monochrome plus one flare. The lifter is the image; the app is the caption.
      </Text>

      <Section title="Colour · dark (the app)">
        <Swatches palette={dark} />
      </Section>
      <Section title="Colour · light">
        <Swatches palette={light} />
      </Section>
      <Section title="Shade over video">
        <Row>
          {[0.35, 0.55, 0.7, 0.9].map((a) => (
            <View key={a} style={{ gap: space.s1 }}>
              <View style={{ width: SWATCH, height: SWATCH, backgroundColor: colors.text }}>
                <View style={{ flex: 1, backgroundColor: shade(a) }} />
              </View>
              <Caption>{`shade(${a})`}</Caption>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Type">
        {(Object.keys(type) as (keyof typeof type)[]).map((k) => (
          <View key={k} style={{ gap: space.s1 }}>
            <Text style={[type[k], { color: colors.text }]} numberOfLines={1}>
              {k === 'hero' ? '6 cm' : 'Stay over the bar longer'}
            </Text>
            <Caption>{`type.${k} · ${type[k].fontSize}/${type[k].lineHeight}`}</Caption>
          </View>
        ))}
        <Row>
          {[24, 28, 32, 36, 48].map((s) => (
            <Text key={s} style={[display(s), { color: colors.text }]}>
              {s}
            </Text>
          ))}
        </Row>
        <Caption>display(size) · Big Shoulders, -2% tracking</Caption>
      </Section>

      <Section title="Spacing">
        {(Object.keys(space) as (keyof typeof space)[]).map((k) => (
          <Row key={k}>
            <View style={{ width: space[k], height: space.s3, backgroundColor: colors.flare }} />
            <Caption>{`space.${k} · ${space[k]}`}</Caption>
          </Row>
        ))}
      </Section>

      <Section title="Radius · curve continuous">
        <Row>
          {(Object.keys(radius) as (keyof typeof radius)[]).map((k) => (
            <View key={k} style={{ gap: space.s1 }}>
              <View
                style={{
                  width: 72,
                  height: SWATCH,
                  backgroundColor: colors.surface2,
                  borderRadius: radius[k],
                  borderCurve: 'continuous',
                }}
              />
              <Caption>{`radius.${k} · ${radius[k]}`}</Caption>
            </View>
          ))}
        </Row>
        <Caption>{`control height ${control.height} · compact ${control.compactHeight} · chip ${control.chipHeight}`}</Caption>
      </Section>

      <Section title="Stroke · opacity · strobe">
        {(Object.keys(stroke) as (keyof typeof stroke)[]).map((k) => (
          <Row key={k}>
            <View style={{ width: 120, height: stroke[k], backgroundColor: colors.text }} />
            <Caption>{`stroke.${k} · ${stroke[k]}`}</Caption>
          </Row>
        ))}
        <Row>
          {(Object.keys(strobe) as (keyof typeof strobe)[]).map((k) => (
            <View key={k} style={{ gap: space.s1 }}>
              <View style={{ width: SWATCH, height: SWATCH, backgroundColor: colors.text, opacity: strobe[k] }} />
              <Caption>{`${k} ${strobe[k]}`}</Caption>
            </View>
          ))}
        </Row>
        <Caption>{Object.entries(opacity).map(([k, v]) => `${k} ${v}`).join(' · ')}</Caption>
      </Section>

      <Section title="Motion">
        <Caption>{Object.entries(motion.duration).map(([k, v]) => `${k} ${v}ms`).join(' · ')}</Caption>
        <Caption>{`stagger ${motion.stagger}ms · ${Object.entries(motion.easing).map(([k, v]) => `${k} (${v.join(', ')})`).join(' · ')}`}</Caption>
      </Section>

      <Section title="Btn">
        <Btn>Try this next session</Btn>
        <Btn kind="secondary">Retake</Btn>
        <Btn compact>Analyse</Btn>
        <Btn kind="secondary" compact>
          Compact secondary
        </Btn>
        <Btn kind="destructive">Delete lift</Btn>
        <Btn disabled>Disabled</Btn>
        <Btn square accessibilityLabel="Square">
          <View style={{ width: 22, height: 22, ...shape.control, backgroundColor: colors.onFlare }} />
        </Btn>
        <Btn kind="text">Not for me</Btn>
      </Section>

      <Section title="Row">
        <View>
          <ListRow divider="top" style={{ paddingVertical: space.s3 }}>
            <Text style={[type.body, { color: colors.text }]}>Units</Text>
            <Readout>kg</Readout>
          </ListRow>
          <ListRow style={{ paddingVertical: space.s3 }}>
            <Text style={[type.body, { color: colors.text }]}>Frame rate</Text>
            <Readout>240 fps</Readout>
          </ListRow>
        </View>
      </Section>

      <Section title="Segmented · Readout · SmallCaps">
        <Segmented
          options={[
            { value: 'snatch', label: 'Snatch' },
            { value: 'clean', label: 'Clean' },
            { value: 'jerk', label: 'Jerk' },
          ]}
          value={seg}
          onChange={setSeg}
        />
        <Segmented
          mono
          options={[
            { value: '30d', label: '30 d' },
            { value: '90d', label: '90 d' },
            { value: 'all', label: 'all' },
          ]}
          value={mono}
          onChange={setMono}
        />
        <Row>
          <Readout>frame 142 · hip · 6 cm fwd</Readout>
          <Readout color={colors.flare}>best 2 cm</Readout>
        </Row>
        <SmallCaps>Setup · First pull · Transition · Catch</SmallCaps>
      </Section>

      <Section title="TopBar · Mark">
        <View style={{ marginHorizontal: -space.gutter }}>
          <TopBar title="snatch · 62.5 kg" />
        </View>
        <Row>
          <Mark size={64} />
          <Mark size={32} />
        </Row>
      </Section>

      <Section title="Sheet">
        <View style={{ height: 200, backgroundColor: colors.surface2 }}>
          <Sheet>
            <Text style={[type.title, { color: colors.text }]}>Delete this lift?</Text>
            <Text style={[type.callout, { color: colors.text2 }]}>The clip and its cue are removed.</Text>
          </Sheet>
        </View>
      </Section>
    </ScrollView>
  );
}
