import { useCallback, useState, type ReactNode } from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { frameSource } from '../../analysis/frames';
import Btn from '../../components/Btn';
import { colors, radius, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { success as hapticSuccess } from '../../lib/haptics';
import type { PurchaseStatus } from '../purchases/usePurchases';
import type { ChipState, StorePlatform } from './entitlements';
import { OFFLINE_BODY, failedBody, failedTitle, purchasingLine, purchasingTitle, successBody } from './copy';
import type { CueStatus } from './proofCues';
import type { Plan } from './products';

export const DEFAULT_BACKDROP = 'asset:snatch/4-extension';

// The saved clip, dimmed, behind every sheet: the lift is never lost behind the paywall.
export function Backdrop({ image = DEFAULT_BACKDROP, opacity = 0.25 }: { image?: string; opacity?: number }) {
  const { width, height } = useWindowDimensions();
  const source = frameSource(image);
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: colors.bg }}>
      {source ? (
        <Image
          source={source}
          testID="paywall-backdrop"
          resizeMode="cover"
          style={{ width, height, opacity }}
        />
      ) : null}
    </View>
  );
}

export function SheetTitle({ children, size = 30 }: { children: string; size?: number }) {
  return <Text style={[display(size), { color: colors.text }]}>{children}</Text>;
}

export function Body({ children, color = colors.text2 }: { children: string; color?: string }) {
  return <Text style={{ color, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 22 }}>{children}</Text>;
}

export function Fine({ children, center }: { children: string; center?: boolean }) {
  return (
    <Text
      style={{
        color: colors.text3,
        fontFamily: fontFamily.body,
        fontSize: 13,
        lineHeight: 18,
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
          fontFamily: fontFamily.bodyMedium,
          fontSize: 15,
          lineHeight: 20,
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
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
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
          <Text style={{ color: colors.text3, fontFamily: fontFamily.bodyBold, fontSize: 17, lineHeight: 22 }}>
            {purchasingLine(plan, price)}
          </Text>
        </View>
      </View>
    );
  }
  if (phase === 'success') {
    return (
      <View testID="state-success" style={{ gap: space.s4 }}>
        <SheetTitle size={34}>{queuedMovement ? 'Unlocked. Analysing your lift.' : 'Unlocked.'}</SheetTitle>
        <Body>{successBody(plan, now, queuedMovement)}</Body>
        <Btn onPress={onWatch} testID="watch-it">
          {queuedMovement ? 'Watch it' : 'Done'}
        </Btn>
      </View>
    );
  }
  if (phase === 'failed') {
    return (
      <View testID="state-failed" style={{ gap: space.s4 }}>
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
          {failedTitle(platform)}
        </Text>
        <Body>{failedBody(!!queuedMovement)}</Body>
        <View style={{ flexDirection: 'row', gap: space.s2 }}>
          <Btn onPress={onRetry} testID="try-again" style={{ flex: 1 }}>
            Try again
          </Btn>
          <Btn kind="secondary" onPress={onNotNow} testID="failed-not-now" style={{ flex: 1 }}>
            Not now
          </Btn>
        </View>
      </View>
    );
  }
  return (
    <View testID="state-offline" style={{ gap: space.s4 }}>
      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
        {"You're offline"}
      </Text>
      <Body>{OFFLINE_BODY}</Body>
      <Btn kind="secondary" onPress={onNotNow} testID="offline-ok">
        OK
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
