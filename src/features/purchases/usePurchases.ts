import { create } from 'zustand';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOfferings, StoreProductChangeInfo } from 'react-native-purchases';
import { loadPurchases, RC_IOS_KEY, RC_ANDROID_KEY } from './client';
import {
  ENTITLEMENT,
  TIER_RANK,
  tierFromEntitlements,
  type Period,
  type Tier,
} from '../paywall/entitlements';
import {
  offeringFor,
  packageIdFor,
  periodFromProductId,
  playSubscriptionId,
  type Plan,
} from '../paywall/products';

export type PurchaseStatus = 'success' | 'cancelled' | 'failed' | 'offline';

type ActivePlan = { tier: Tier; period: Period | null; expiresAt: string | null };

export function planFromInfo(info: CustomerInfo | null): ActivePlan {
  const active = info?.entitlements?.active ?? {};
  const tier = tierFromEntitlements(Object.keys(active));
  if (tier === 'free') return { tier, period: null, expiresAt: null };
  const ent = active[ENTITLEMENT[tier]];
  return {
    tier,
    period: ent?.productIdentifier ? periodFromProductId(ent.productIdentifier) : null,
    expiresAt: ent?.expirationDate ?? null,
  };
}

// RevenueCat error codes: 1 cancelled, 10 network, 35 offline connection.
export function classifyPurchaseError(e: unknown): PurchaseStatus {
  const err = (e ?? {}) as { userCancelled?: boolean | null; code?: string };
  if (err.userCancelled || err.code === '1') return 'cancelled';
  if (err.code === '10' || err.code === '35') return 'offline';
  return 'failed';
}

function apiKey(): string {
  return Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY || RC_IOS_KEY;
}

// The real SDK only when it loaded AND a key is set; otherwise demo mode.
function liveSdk() {
  const { Purchases } = loadPurchases();
  return Purchases && apiKey() ? Purchases : null;
}

interface PurchasesState extends ActivePlan {
  ready: boolean;
  demo: boolean;
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;
  /** What a demo purchase resolves to, so every paywall state is reachable without keys. */
  demoOutcome: PurchaseStatus;
  configure: () => Promise<void>;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  restore: () => Promise<Tier>;
  setDemoPlan: (tier: Tier, period?: Period | null) => void;
  setDemoOutcome: (outcome: PurchaseStatus) => void;
}

export const usePurchases = create<PurchasesState>((set, get) => ({
  ready: false,
  demo: true,
  tier: 'free',
  period: null,
  expiresAt: null,
  offerings: null,
  customerInfo: null,
  demoOutcome: 'success',

  configure: async () => {
    if (get().ready) return;
    const Purchases = liveSdk();
    if (!Purchases) {
      set({ ready: true, demo: true });
      return;
    }
    try {
      // RevenueCat logs through console.error, which LogBox shows as a red screen.
      Purchases.setLogHandler((level, message) => {
        console.log(`[RevenueCat] ${level}: ${message}`);
      });
      Purchases.configure({ apiKey: apiKey() });
      Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
        set({ customerInfo: info, ...planFromInfo(info) });
      });
      const [info, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
      set({ ready: true, demo: false, customerInfo: info, offerings, ...planFromInfo(info) });
    } catch {
      set({ ready: true, demo: false });
    }
  },

  purchase: async (plan: Plan) => {
    const Purchases = liveSdk();
    if (!Purchases) {
      const outcome = get().demoOutcome;
      if (outcome === 'success') {
        set({
          tier: plan.kind === 'founding' ? 'founding' : plan.tier,
          period: plan.kind === 'founding' ? null : plan.period,
        });
      }
      return outcome;
    }
    try {
      const offerings = get().offerings ?? (await Purchases.getOfferings());
      const pkg = offerings.all[offeringFor(plan)]?.availablePackages.find(
        (p) => p.identifier === packageIdFor(plan)
      );
      if (!pkg) return 'failed';
      const { customerInfo } = await Purchases.purchasePackage(pkg, null, playChangeInfo(get().tier, plan, Purchases));
      const next = planFromInfo(customerInfo);
      set({ customerInfo, ...next });
      return next.tier === 'free' ? 'failed' : 'success';
    } catch (e) {
      return classifyPurchaseError(e);
    }
  },

  restore: async () => {
    const Purchases = liveSdk();
    if (!Purchases) return get().tier;
    try {
      const info = await Purchases.restorePurchases();
      set({ customerInfo: info, ...planFromInfo(info) });
      return get().tier;
    } catch {
      return get().tier;
    }
  },

  setDemoPlan: (tier, period = null) => set({ tier, period, expiresAt: null }),
  setDemoOutcome: (demoOutcome) => set({ demoOutcome }),
}));

type Sdk = NonNullable<ReturnType<typeof liveSdk>>;

// Play needs the old subscription to switch tiers; upgrades charge the prorated
// difference now (see upgradeQuote), downgrades wait for the renewal.
function playChangeInfo(current: Tier, plan: Plan, Purchases: Sdk): StoreProductChangeInfo | null {
  if (Platform.OS !== 'android' || plan.kind !== 'sub') return null;
  if (current !== 'hook' && current !== 'pull' && current !== 'platform') return null;
  if (current === plan.tier) return null;
  const up = TIER_RANK[plan.tier] > TIER_RANK[current];
  return {
    oldProductIdentifier: playSubscriptionId(current),
    replacementMode: up
      ? Purchases.STORE_REPLACEMENT_MODE.CHARGE_PRORATED_PRICE
      : Purchases.STORE_REPLACEMENT_MODE.DEFERRED,
  };
}

// RevenueCat Customer Center for managing or cancelling. No-op without the SDK so the
// caller can fall back to the in-app plans screen.
export async function presentCustomerCenter(): Promise<boolean> {
  const { RevenueCatUI } = loadPurchases();
  if (!RevenueCatUI || !liveSdk()) return false;
  try {
    await RevenueCatUI.presentCustomerCenter();
    await usePurchases.getState().restore();
    return true;
  } catch {
    return false;
  }
}
