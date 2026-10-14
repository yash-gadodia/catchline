import { create } from 'zustand';
import { Platform } from 'react-native';
import type { CustomerInfo, PurchasesOfferings, StoreProductChangeInfo } from 'react-native-purchases';
import { loadPurchases, RC_IOS_KEY, RC_ANDROID_KEY } from './client';
import { supabase } from '../../lib/supabase';
import { ensureSession, getAllowance, syncPlan } from '../../lib/api';
import { backendEnabled } from '../../data/backend';
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

// RevenueCat code 6 (PRODUCT_ALREADY_PURCHASED): the Apple ID already holds the
// subscription, so a restore is what the lifter needs, not another purchase.
export function isAlreadyPurchased(e: unknown): boolean {
  const err = (e ?? {}) as { code?: string; message?: string };
  return err.code === '6' || /already (purchased|subscribed|active)/i.test(err.message ?? '');
}

function apiKey(): string {
  return Platform.OS === 'ios' ? RC_IOS_KEY : RC_ANDROID_KEY || RC_IOS_KEY;
}

// The server's plan (profiles.plan) follows RevenueCat via the revenuecat-webhook
// edge function. After a purchase or restore, poll until it catches up so the
// next create_lift sees the new cap. Gives up quietly: the purchase still stands.
export async function waitForServerPlan(tier: Tier, tries = 8, intervalMs = 1500): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try {
      const { plan } = await getAllowance();
      if (TIER_RANK[plan] >= TIER_RANK[tier]) return true;
    } catch {
      // offline or no session yet: try again
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.log(`[RevenueCat] server plan has not reached ${tier} yet`);
  return false;
}

// After a purchase or restore: wait for the webhook, then pull the plan straight
// from RevenueCat (sync-plan) if it never arrived.
export async function settleServerPlan(tier: Tier, tries?: number, intervalMs?: number): Promise<boolean> {
  if (await waitForServerPlan(tier, tries, intervalMs)) return true;
  try {
    const { plan } = await syncPlan();
    return TIER_RANK[plan] >= TIER_RANK[tier];
  } catch {
    return false;
  }
}

// On launch: RevenueCat ranking above the server means a webhook was missed.
export async function reconcileServerPlan(tier: Tier): Promise<void> {
  if (tier === 'free') return;
  try {
    const { plan } = await getAllowance();
    if (TIER_RANK[tier] > TIER_RANK[plan]) await syncPlan();
  } catch {
    // offline: the next purchase, restore or capped lift syncs
  }
}

// The real SDK only when it loaded AND a key is set; otherwise demo mode.
function liveSdk() {
  const { Purchases } = loadPurchases();
  return Purchases && apiKey() ? Purchases : null;
}

interface PurchasesState extends ActivePlan {
  ready: boolean;
  demo: boolean;
  /** The RevenueCat app user id: the Supabase user id once a session exists. */
  appUserId: string | null;
  offerings: PurchasesOfferings | null;
  customerInfo: CustomerInfo | null;
  /** What a demo purchase resolves to, so every paywall state is reachable without keys. */
  demoOutcome: PurchaseStatus;
  configure: () => Promise<void>;
  identify: (userId: string) => Promise<void>;
  purchase: (plan: Plan) => Promise<PurchaseStatus>;
  restore: () => Promise<Tier>;
  /** The server's plan when it ranks above RevenueCat's; true when the server holds a paid plan. */
  adoptServerPlan: () => Promise<boolean>;
  /** Back to a free, unidentified plan; RevenueCat forgets the user too. */
  signOut: () => void;
  setDemoPlan: (tier: Tier, period?: Period | null) => void;
  setDemoOutcome: (outcome: PurchaseStatus) => void;
}

export const usePurchases = create<PurchasesState>((set, get) => ({
  ready: false,
  demo: true,
  appUserId: null,
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
      // The webhook maps app_user_id to profiles.id, so RevenueCat must know the
      // Supabase user. Anonymous until a session exists; identify() logs in later.
      const userId = backendEnabled() ? (await supabase.auth.getSession()).data.session?.user.id ?? null : null;
      Purchases.configure({ apiKey: apiKey(), appUserID: userId });
      set({ appUserId: userId });
      Purchases.addCustomerInfoUpdateListener((info: CustomerInfo) => {
        set({ customerInfo: info, ...planFromInfo(info) });
      });
      if (backendEnabled()) {
        supabase.auth.onAuthStateChange((_event, session) => {
          if (session) get().identify(session.user.id).catch(() => undefined);
        });
      }
      const [info, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
      set({ ready: true, demo: false, customerInfo: info, offerings, ...planFromInfo(info) });
      if (backendEnabled() && userId) void reconcileServerPlan(planFromInfo(info).tier);
    } catch {
      set({ ready: true, demo: false });
    }
  },

  identify: async (userId: string) => {
    const Purchases = liveSdk();
    if (!Purchases || get().appUserId === userId) return;
    const { customerInfo } = await Purchases.logIn(userId);
    set({ appUserId: userId, customerInfo, ...planFromInfo(customerInfo) });
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
      if (backendEnabled()) await get().identify(await ensureSession());
      const offerings = get().offerings ?? (await Purchases.getOfferings());
      const pkg = offerings.all[offeringFor(plan)]?.availablePackages.find(
        (p) => p.identifier === packageIdFor(plan)
      );
      if (!pkg) return 'failed';
      const { customerInfo } = await Purchases.purchasePackage(pkg, null, playChangeInfo(get().tier, plan, Purchases));
      const next = planFromInfo(customerInfo);
      set({ customerInfo, ...next });
      if (next.tier === 'free') return 'failed';
      if (backendEnabled()) await settleServerPlan(next.tier);
      return 'success';
    } catch (e) {
      if (isAlreadyPurchased(e)) return (await get().restore()) === 'free' ? 'failed' : 'success';
      return classifyPurchaseError(e);
    }
  },

  restore: async () => {
    const Purchases = liveSdk();
    if (!Purchases) return get().tier;
    try {
      if (backendEnabled()) await get().identify(await ensureSession());
      const info = await Purchases.restorePurchases();
      set({ customerInfo: info, ...planFromInfo(info) });
      if (backendEnabled() && get().tier !== 'free') await settleServerPlan(get().tier);
      return get().tier;
    } catch {
      return get().tier;
    }
  },

  // The server enforces the cap, so a plan it holds that RevenueCat has not
  // caught up with (a fresh install before the receipt is restored) is shown as
  // that plan, never as free with a paywall the lifter has already paid past.
  adoptServerPlan: async () => {
    if (!backendEnabled()) return false;
    try {
      const { plan } = await getAllowance();
      if (plan === 'free') return false;
      if (TIER_RANK[plan] > TIER_RANK[get().tier]) set({ tier: plan, period: null, expiresAt: null });
      return true;
    } catch {
      return false;
    }
  },

  // Left logged in, RevenueCat's next customer-info refresh would hand the
  // signed-out user's plan back to the anonymous one this phone starts next.
  signOut: () => {
    const Purchases = liveSdk();
    const identified = get().appUserId !== null;
    set({ appUserId: null, customerInfo: null, tier: 'free', period: null, expiresAt: null });
    if (Purchases && identified) Purchases.logOut().catch(() => undefined);
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
