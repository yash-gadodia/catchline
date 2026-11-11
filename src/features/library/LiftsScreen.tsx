import { backendEnabled } from '../../data/backend';
import { usePurchases } from '../purchases/usePurchases';
import { FREE_PER_WEEK } from '../paywall/entitlements';
import { useVideosLeft } from '../paywall/hooks';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Btn from '../../components/Btn';
import Row from '../../components/Row';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { freeVideosLabel, liftDetail, liftTitle, newestFirst } from './derive';
import { t } from '../../i18n';
import { useLibrary } from './repository';
import type { Lift } from './types';
import { Frame, Pulse, Title, Underlined } from './ui';

export type LiftsNav = {
  onOpen: (lift: Lift) => void;
  onUnlock: () => void;
  onRecord: () => void;
  onImport: () => void;
  onDelete: (lift: Lift) => void;
};

export default function LiftsScreen({ nav }: { nav: LiftsNav }) {
  const insets = useSafeAreaInsets();
  const lib = useLibrary();
  const tier = usePurchases((s) => s.tier);
  const used = FREE_PER_WEEK - useVideosLeft();
  // With a backend, the live plan, so a purchase shows at once, not after the next library sync.
  const chip = freeVideosLabel(backendEnabled() ? { plan: tier === 'free' ? 'free' : 'paid', freeVideosUsed: used } : lib);
  const header = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Title>{t('library.tabs.lifts')}</Title>
      {chip ? (
        <Pressable onPress={nav.onUnlock} testID="free-chip" hitSlop={8} style={{ height: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.text2, ...type.readout }}>{chip}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (lib.lifts.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter }} testID="lifts-empty">
        {header}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s5 }}>
          <SideOnDiagram />
          <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>{t('library.lifts.emptyTitle')}</Text>
          <Text style={{ color: colors.text2, ...type.callout, textAlign: 'center' }}>
            {t('library.lifts.emptyBody')}
          </Text>
          <View style={{ alignSelf: 'stretch', gap: space.s3 }}>
            <Btn onPress={nav.onImport} testID="empty-import">
              {t('library.lifts.import')}
            </Btn>
            <Btn kind="secondary" onPress={nav.onRecord} testID="empty-record">
              {t('library.lifts.record')}
            </Btn>
          </View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + space.s3, paddingHorizontal: space.gutter, paddingBottom: space.s6, gap: space.s4 }}
      testID="lifts"
    >
      {header}
      <View>
        {newestFirst(lib.lifts).map((l) => (
          <LiftRow key={l.id} lift={l} nav={nav} />
        ))}
      </View>
    </ScrollView>
  );
}

function LiftRow({ lift, nav }: { lift: Lift; nav: LiftsNav }) {
  const muted = lift.status === 'queued';
  const detail = liftDetail(lift);
  const thumb =
    lift.status === 'processing' ? (
      <Pulse>
        <View style={{ width: 48, height: 56, backgroundColor: colors.surface }} />
      </Pulse>
    ) : lift.status === 'failed' ? (
      <View style={{ width: 48, height: 56, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.text3, ...type.label, fontFamily: fontFamily.mono }}>?</Text>
      </View>
    ) : (
      <Frame image={lift.thumb} width={48} height={56} opacity={muted ? 0.4 : 1} testID="lift-thumb" />
    );
  return (
    <Row onPress={() => nav.onOpen(lift)} onLongPress={() => nav.onDelete(lift)} testID={`lift-${lift.id}`} divider="top" style={{ gap: space.s4, paddingVertical: space.s3 }}>
      {thumb}
      <View style={{ flex: 1, gap: 2 }}>
        <Text testID={`lift-title-${lift.id}`} style={{ color: muted ? colors.text2 : colors.text, ...type.button }}>
          {liftTitle(lift)}
        </Text>
        {detail ? (
          <Text testID={`lift-detail-${lift.id}`} numberOfLines={1} style={{ color: colors.text2, ...type.readout }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {lift.status === 'queued' ? <Underlined onPress={nav.onUnlock} testID={`unlock-${lift.id}`}>{t('library.lifts.unlock')}</Underlined> : null}
    </Row>
  );
}

function SideOnDiagram() {
  return (
    <Svg width={240} height={160} viewBox="0 0 240 160">
      <Line x1={0} y1={140} x2={240} y2={140} stroke={colors.hairline} />
      <Rect x={24} y={118} width={10} height={22} fill={colors.text} />
      <Rect x={20} y={130} width={18} height={10} fill={colors.hairline} />
      <G fill={colors.text} opacity={0.5}>
        <Circle cx={186} cy={56} r={7} />
        <Path d="M180 64 L192 64 L197 98 L192 128 L184 128 L185 106 L178 106 L175 128 L167 128 L172 98Z" />
        <Path d="M186 64 L208 52 L211 58 L190 70Z" />
        <Rect x={211} y={48} width={6} height={14} />
        <Rect x={164} y={48} width={6} height={14} />
      </G>
      <Line x1={38} y1={130} x2={166} y2={130} stroke={colors.flare} strokeWidth={1.5} />
      <SvgText x={84} y={124} fontFamily={fontFamily.display} fontSize={16} fill={colors.flare}>
        3–4 m
      </SvgText>
    </Svg>
  );
}
