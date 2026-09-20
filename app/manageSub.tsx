import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { PurchasesEntitlementInfo } from 'react-native-purchases';
import { safeBack } from "../src/lib/nav";
import { colors, gradients, radius, space } from '../src/design/tokens';
import { fontFamily } from '../src/design/typography';
import { Kick, Serif } from '../src/components/Text';
import TopBar from '../src/components/TopBar';
import Btn from '../src/components/Btn';
import Press from '../src/components/Press';
import Card from '../src/components/Card';
import { Mark } from '../src/components/Mark';
import { DawnBlobs } from '../src/components/DawnBlobs';
import Toast from '../src/components/Toast';
import { Icon, ICONS } from '../src/components/Icon';
import { usePurchases, presentCustomerCenter } from '../src/features/purchases/usePurchases';
import { purchasesAvailable, ENTITLEMENT_ID } from '../src/features/purchases/client';

function formatEntitlementDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusCard({ status, badge }: { status: string; badge?: string }) {
  return (
    <LinearGradient
      colors={gradients.usSoft.colors}
      locations={gradients.usSoft.locations}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(157,149,245,0.25)',
        marginBottom: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Mark size={24} />

      <View style={{ flex: 1 }}>
        <Text
          allowFontScaling={false}
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: colors.ink,
            fontFamily: fontFamily.ui,
          }}
        >
          Parallax Plus
        </Text>
        <Kick
          c={colors.matchDeep}
          style={{
            marginTop: 3,
          }}
        >
          {status}
        </Kick>
      </View>

      {badge && (
        <Text
          allowFontScaling={false}
          style={{
            fontSize: 9,
            fontWeight: '700',
            letterSpacing: 1.6,
            color: '#fff',
            backgroundColor: colors.p2,
            paddingVertical: 4,
            paddingHorizontal: 9,
            borderRadius: radius.pill,
          }}
        >
          {badge}
        </Text>
      )}
    </LinearGradient>
  );
}

const PLAN_LABELS: Record<string, string> = {
  parallax_plus_monthly: 'Plus · Monthly',
  parallax_plus_annual: 'Plus · Annual',
  parallax_plus_lifetime: 'Plus · Lifetime',
};

// Plan details built only from fields RevenueCat actually returned.
function PlanDetailsCard({ entitlement }: { entitlement: PurchasesEntitlementInfo }) {
  const rows: [string, string][] = [
    ['Plan', PLAN_LABELS[entitlement.productIdentifier] ?? entitlement.productIdentifier],
  ];
  if (entitlement.expirationDate) {
    rows.push([
      entitlement.willRenew ? 'Renews' : 'Expires',
      formatEntitlementDate(entitlement.expirationDate),
    ]);
  }

  return (
    <Card style={{ overflow: 'hidden', marginTop: 14, borderRadius: 20 }}>
      {rows.map((row, i) => (
        <View
          key={`row-${i}`}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 14,
            paddingHorizontal: 16,
            borderTopWidth: i ? 1 : 0,
            borderTopColor: colors.line,
          }}
        >
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 14.5,
              color: colors.inkSoft,
              fontWeight: '600',
            }}
          >
            {row[0]}
          </Text>
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 14.5,
              color: colors.ink,
              fontWeight: '700',
            }}
          >
            {row[1]}
          </Text>
        </View>
      ))}
    </Card>
  );
}

export default function ManageSubScreen() {
  const router = useRouter();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const setDemoPro = usePurchases((s) => s.setDemoPro);
  const isPro = usePurchases((s) => s.isPro);
  const customerInfo = usePurchases((s) => s.customerInfo);
  const available = purchasesAvailable();
  const entitlement = available
    ? customerInfo?.entitlements?.active?.[ENTITLEMENT_ID] ?? null
    : null;

  const handleManagePlan = () => {
    presentCustomerCenter();
  };

  const handleCancelSubscription = async () => {
    try {
      const url = Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions?package=com.yashgadodia.parallax';
      await Linking.openURL(url);
    } catch (e) {
      setToastMsg('Could not open subscription settings');
      setTimeout(() => setToastMsg(null), 2000);
    }
  };

  const handleRemoveDemoPro = () => {
    setDemoPro(false);
    setToastMsg('Demo unlock removed');
    setTimeout(() => setToastMsg(null), 2000);
  };

  const handleBack = () => {
    safeBack(router);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg0 }}>
      <LinearGradient
        colors={gradients.dawn.colors}
        locations={gradients.dawn.locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      <DawnBlobs />

      <TopBar title="manage plus" onBack={handleBack} />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 40,
          paddingHorizontal: space.gutter,
        }}
        style={{ flex: 1 }}
      >
        {/* Top padding */}
        <View style={{ height: 50 }} />

        {!isPro ? (
          <>
            <Card
              style={{
                borderRadius: 24,
                padding: 24,
                marginBottom: 14,
                alignItems: 'center',
              }}
            >
              <Mark size={24} />
              <Serif s={26} c={colors.ink} style={{ marginTop: 12 }}>
                No active plan
              </Serif>
              <Text
                allowFontScaling={false}
                style={{
                  fontSize: 14,
                  lineHeight: 20,
                  color: colors.inkSoft,
                  fontFamily: fontFamily.ui,
                  textAlign: 'center',
                  marginTop: 6,
                }}
              >
                Parallax Plus unlocks every pack, for both of you.
              </Text>
            </Card>
            <Btn kind="us" onPress={() => router.push('/(sheets)/plus')}>
              See Plus plans
            </Btn>
          </>
        ) : !available ? (
          <>
            <StatusCard status="● demo unlock" badge="DEMO" />
            <Text
              allowFontScaling={false}
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                marginBottom: 14,
                paddingHorizontal: 4,
              }}
            >
              This is a local demo unlock, not a real subscription — nothing is billed.
            </Text>
            <Btn kind="soft" onPress={handleRemoveDemoPro}>
              Remove demo unlock
            </Btn>
          </>
        ) : (
          <>
            <StatusCard
              status={
                entitlement?.periodType === 'TRIAL' ? '● active · free trial' : '● active'
              }
            />
            {entitlement && <PlanDetailsCard entitlement={entitlement} />}

            {/* Cancel subscription row */}
            <Card style={{ overflow: 'hidden', marginTop: 18, borderRadius: 20 }}>
              <Press onPress={handleCancelSubscription}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: 14.5,
                      fontWeight: '600',
                      color: colors.p2,
                      fontFamily: fontFamily.ui,
                    }}
                  >
                    Cancel subscription
                  </Text>
                  <Icon d={ICONS.chevR} size={16} color={colors.inkMute} />
                </View>
              </Press>
            </Card>

            {/* Single billing surface note */}
            <Text
              allowFontScaling={false}
              style={{
                fontSize: 12,
                lineHeight: 17,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                marginTop: 14,
                paddingHorizontal: 4,
              }}
            >
              You're billed once, through the App Store — never doubled across platforms.
            </Text>
          </>
        )}
      </ScrollView>

      {toastMsg && <Toast msg={toastMsg} />}
    </View>
  );
}
