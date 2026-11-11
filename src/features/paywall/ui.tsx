import { useCallback, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Btn from '../../components/Btn';
import { colors, shape, space } from '../../design/tokens';
import { display, type } from '../../design/typography';
import { success as hapticSuccess } from '../../lib/haptics';
import type { PurchaseStatus } from '../purchases/usePurchases';
import { t } from '../../i18n';
import { PRIVACY_URL, TERMS_URL } from '../../lib/links';
import type { StorePlatform } from './entitlements';
import { failedBody, failedTitle, purchasingLine, purchasingTitle, successBody } from './copy';
import type { Plan } from './products';

const ART = { source: require('../../../assets/art/paywall-catch.png'), width: 507, height: 720 };

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

// Flat silhouette art above the sheet, dimmed, never cut by the sheet edge.
export function Backdrop({ sheetTop }: { sheetTop: number | null }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const frame = sheetTop === null ? null : artFrame(ART, { top: insets.top, bottom: sheetTop }, width);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, backgroundColor: colors.bg }}>
      {frame ? (
        <Image
          source={ART.source}
          testID="paywall-art"
          resizeMode="contain"
          style={{ position: 'absolute', ...frame, opacity: 0.4 }}
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

export function LegalLinks() {
  return (
    <Text style={{ color: colors.text2, ...type.small, textAlign: 'center' }}>
      <Text onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link" testID="link-terms">
        {t('paywall.terms')}
      </Text>
      {' · '}
      <Text onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link" testID="link-privacy">
        {t('paywall.privacy')}
      </Text>
    </Text>
  );
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
  queued,
  onDone,
  onRetry,
  onNotNow,
}: {
  phase: Exclude<Phase, 'choose'>;
  plan: Plan;
  price: string;
  platform: StorePlatform;
  now: Date;
  queued: boolean;
  onDone: () => void;
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
            ...shape.control,
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
        <SheetTitle size={34}>{t('paywall.owned.title')}</SheetTitle>
        <Body>{successBody(plan, now)}</Body>
        <Btn onPress={onDone} testID="watch-it">
          {queued ? t('paywall.state.watch') : t('paywall.state.done')}
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
        <Body>{failedBody(queued)}</Body>
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
      <Body>{t('paywall.offlineBody')}</Body>
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
        ...shape.control,
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
