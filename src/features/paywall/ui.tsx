import { useCallback, useState, type ReactNode } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { colors, radius, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { success as hapticSuccess } from '../../lib/haptics';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { t } from '../../i18n';
import type { ChipState, StorePlatform } from './entitlements';
import { failedBody, offlineBody, failedTitle, purchasingLine, purchasingTitle, successBody } from './copy';
import type { CueStatus } from './proofCues';
import type { Plan } from './products';

export const ART = {
  catch: { source: require('../../../assets/art/paywall-catch.png'), width: 507, height: 720 },
  setup: { source: require('../../../assets/art/paywall-setup.png'), width: 792, height: 720 },
  power: { source: require('../../../assets/art/paywall-power.png'), width: 567, height: 720 },
  trail: { source: require('../../../assets/art/paywall-trail.png'), width: 497, height: 720 },
} as const;
export type ArtName = keyof typeof ART;

const ART_PAD = 16;
const ART_MAX_H = 280;
const ART_MAX_W = 0.72;

// The whole figure, centred in the band between the status bar and the sheet top.
export function artFrame(art: { width: number; height: number }, band: { top: number; bottom: number }, screenWidth: number) {
  const maxH = Math.min(ART_MAX_H, band.bottom - band.top - ART_PAD * 2);
  const k = Math.max(0, Math.min(maxH / art.height, (screenWidth * ART_MAX_W) / art.width));
  const width = art.width * k;
  const height = art.height * k;
  return { left: (screenWidth - width) / 2, top: band.top + (band.bottom - band.top - height) / 2, width, height };
}

export function useSheetTop() {
  const [top, setTop] = useState<number | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => setTop(e.nativeEvent.layout.y), []);
  return { top, onLayout };
}

// Flat silhouette art above every sheet, dimmed, never cut by the sheet edge.
export function Backdrop({ art, sheetTop, opacity = 0.4 }: { art: ArtName; sheetTop: number | null; opacity?: number }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const a = ART[art];
  const frame = sheetTop === null ? null : artFrame(a, { top: insets.top, bottom: sheetTop }, width);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: colors.bg }}>
      {frame ? (
        <Image
          source={a.source}
          testID={`paywall-art-${art}`}
          resizeMode="contain"
          style={{ position: 'absolute', ...frame, opacity }}
        />
      ) : null}
    </View>
  );
}

export function SheetTitle({ children, size = 30 }: { children: string; size?: number }) {
  return <Text style={[display(size), { color: colors.text }]}>{children}</Text>;
}

export function Body({ children, color = colors.text2 }: { children: string; color?: string }) {
  return <Text style={{ color, ...type.callout }}>{children}</Text>;
}

export function Fine({ children, center }: { children: string; center?: boolean }) {
  return (
    <Text
      style={{
        color: colors.text2,
        ...type.small,
        textAlign: center ? 'center' : 'left',
      }}
    >
      {children}
    </Text>
  );
}

// Monochrome status: bone filled = stuck, flare = trying, hollow bone = didn't stick, text-3 = dropped.
export function StatusDot({ status }: { status: CueStatus }) {
  const base = { width: 8, height: 8, borderRadius: 4 };
  if (status === 'stuck') return <View testID="dot-stuck" style={[base, { backgroundColor: colors.text }]} />;
  if (status === 'trying') return <View testID="dot-trying" style={[base, { backgroundColor: colors.flare }]} />;
  if (status === 'didnt') {
    return <View testID="dot-didnt" style={[base, { borderWidth: 1.5, borderColor: colors.text }]} />;
  }
  return <View testID="dot-dropped" style={[base, { backgroundColor: colors.text3 }]} />;
}

export function FreeVideosChip({ state, onPress }: { state: ChipState | null; onPress?: () => void }) {
  if (!state) return null;
  const last = state.tone === 'last';
  const used = state.tone === 'used';
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      testID={`free-chip-${state.tone}`}
      style={{
        height: 36,
        paddingHorizontal: space.s3,
        borderWidth: 1,
        borderColor: last ? colors.flare : colors.hairline,
        borderRadius: radius.control,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: last ? colors.flare : used ? colors.text2 : colors.text,
          ...type.label,
        }}
      >
        {state.label}
      </Text>
    </Pressable>
  );
}

export function Row({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space.s3,
        paddingVertical: space.s3,
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.hairline,
      }}
    >
      {children}
    </View>
  );
}

export type Phase = 'choose' | 'purchasing' | 'success' | 'failed' | 'offline';

export function usePurchaseFlow(purchase: (plan: Plan) => Promise<PurchaseStatus>, initial: Phase = 'choose') {
  const [phase, setPhase] = useState<Phase>(initial);
  const [plan, setPlan] = useState<Plan | null>(null);
  const run = useCallback(
    async (next: Plan) => {
      setPlan(next);
      setPhase('purchasing');
      const status = await purchase(next);
      if (status === 'success') hapticSuccess();
      setPhase(status === 'cancelled' ? 'choose' : status);
    },
    [purchase]
  );
  const reset = useCallback(() => setPhase('choose'), []);
  return { phase, plan, run, reset };
}

export function PurchaseStateSheet({
  phase,
  plan,
  price,
  platform,
  now,
  queuedMovement,
  onWatch,
  onRetry,
  onNotNow,
}: {
  phase: Exclude<Phase, 'choose'>;
  plan: Plan;
  price: string;
  platform: StorePlatform;
  now: Date;
  queuedMovement?: string;
  onWatch: () => void;
  onRetry: () => void;
  onNotNow: () => void;
}) {
  if (phase === 'purchasing') {
    return (
      <View testID="state-purchasing" style={{ gap: space.s5 }}>
        <Text style={{ color: colors.text, ...type.title }}>
          {purchasingTitle(platform)}
        </Text>
        <View
          style={{
            height: 56,
            borderRadius: radius.control,
            backgroundColor: colors.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: colors.text3, ...type.button }}>
            {purchasingLine(plan, price)}
          </Text>
        </View>
      </View>
    );
  }
  if (phase === 'success') {
    return (
      <View testID="state-success" style={{ gap: space.s4 }}>
        <SheetTitle size={34}>{queuedMovement ? t('paywall.state.unlockedQueued') : t('paywall.state.unlocked')}</SheetTitle>
        <Body>{successBody(plan, now, queuedMovement)}</Body>
        <Btn onPress={onWatch} testID="watch-it">
          {queuedMovement ? t('paywall.state.watch') : t('paywall.state.done')}
        </Btn>
      </View>
    );
  }
  if (phase === 'failed') {
    return (
      <View testID="state-failed" style={{ gap: space.s4 }}>
        <Text style={{ color: colors.text, ...type.title }}>
          {failedTitle(platform)}
        </Text>
        <Body>{failedBody(!!queuedMovement)}</Body>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          <Btn onPress={onRetry} testID="try-again" style={{ flex: 1 }}>
            {t('paywall.state.tryAgain')}
          </Btn>
          <Btn kind="secondary" onPress={onNotNow} testID="failed-not-now" style={{ flex: 1 }}>
            {t('paywall.notNow')}
          </Btn>
        </View>
      </View>
    );
  }
  return (
    <View testID="state-offline" style={{ gap: space.s4 }}>
      <Text style={{ color: colors.text, ...type.title }}>
        {t('paywall.state.offline')}
      </Text>
      <Body>{offlineBody()}</Body>
      <Btn kind="secondary" onPress={onNotNow} testID="offline-ok">
        {t('paywall.state.ok')}
      </Btn>
    </View>
  );
}

export function OptionCard({
  selected,
  onPress,
  testID,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={{
        paddingVertical: space.s2,
        paddingHorizontal: space.s4,
        minHeight: 56,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.text : colors.hairline,
        borderRadius: radius.control,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space.s3,
      }}
    >
      {children}
    </Pressable>
  );
}
