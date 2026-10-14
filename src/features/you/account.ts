import { create } from 'zustand';
import { clearLiveAnalyses } from '../../analysis/live';
import { backendEnabled, resetConsentSync } from '../../data/backend';
import { deleteAccount as deleteRemoteAccount } from '../../lib/api';
import { useCapture } from '../capture/store';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import { useOnboarding } from '../onboarding/store';
import {
  FREE_VIDEOS as FREE_BY_VARIANT,
  MONTHLY_CAP,
  TIER_NAME,
  videosRemaining,
  type Tier as LiveTier,
  type Usage,
  type Variant,
} from '../paywall/entitlements';
import { useUsage } from '../paywall/usageStore';
import { usePurchases } from '../purchases/usePurchases';
import type { Settings } from './settings';

export type Tier = 'free' | 'hook' | 'pull' | 'platform';
export type Billing = 'monthly' | 'annual';

export type Plan =
  | { tier: 'free'; videosUsed: number }
  | { tier: Exclude<Tier, 'free'>; founding: true }
  | { tier: Exclude<Tier, 'free'>; founding: false; billing: Billing; renewsOn: string };

export type Account = {
  name: string;
  signIn: 'apple' | 'google' | 'email';
  synced: boolean;
  plan: Plan;
};

export const FREE_VIDEOS = 3;

export const PRICES: Record<Exclude<Tier, 'free'>, Record<Billing, string>> = {
  hook: { monthly: '$4.99/mo', annual: '$29.99/yr' },
  pull: { monthly: '$9.99/mo', annual: '$59.99/yr' },
  platform: { monthly: '$14.99/mo', annual: '$99.99/yr' },
};

const TIER_NAMES: Record<Tier, string> = { free: 'Free', hook: 'Hook', pull: 'Pull', platform: 'Platform' };
const SIGN_IN: Record<Account['signIn'], string> = { apple: 'Apple', google: 'Google', email: 'email' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Founding is a one-off purchase: Pull for life, so there is no renewal date to show.
export function planLabel(plan: Plan): string {
  if (plan.tier === 'free') {
    const left = Math.max(0, FREE_VIDEOS - plan.videosUsed);
    return `Free · ${left} of ${FREE_VIDEOS} videos left`;
  }
  const name = TIER_NAMES[plan.tier];
  if (plan.founding) return `${name} · Founding member · for life`;
  const d = new Date(plan.renewsOn);
  return `${name} · ${PRICES[plan.tier][plan.billing]} · renews ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function isFounding(plan: Plan): boolean {
  return plan.tier !== 'free' && plan.founding;
}

export function accountLine(a: Account): string {
  return `Signed in with ${SIGN_IN[a.signIn]}${a.synced ? ' · synced' : ''}`;
}

export const ANONYMOUS_LINE = 'Anonymous on this phone';

// With a backend the plan is the RevenueCat tier and the allowance is the usage
// store's count against the tier's cap (the server enforces the real cap).
export function livePlanLabel(tier: LiveTier, usage: Usage, variant: Variant, now: Date): string {
  const left = videosRemaining(tier, usage, now, variant);
  if (tier === 'free') return `Free · ${left} of ${FREE_BY_VARIANT[variant]} videos left`;
  return `${TIER_NAME[tier]} · ${left} of ${MONTHLY_CAP[tier]} videos left this month`;
}

// What the You tab shows. name is null while the account is anonymous (no sign-in yet).
export type AccountView = { name: string | null; line: string; plan: string; founding: boolean };

function fixtureView(a: Account | null): AccountView | null {
  return a ? { name: a.name, line: accountLine(a), plan: planLabel(a.plan), founding: isFounding(a.plan) } : null;
}

function liveView(tier: LiveTier, usage: Usage, variant: Variant, now: Date): AccountView {
  return { name: null, line: ANONYMOUS_LINE, plan: livePlanLabel(tier, usage, variant, now), founding: tier === 'founding' };
}

export function accountView(now: Date = new Date()): AccountView | null {
  if (!backendEnabled()) return fixtureView(useAccountStore.getState().account);
  const { usage, variant } = useUsage.getState();
  return liveView(usePurchases.getState().tier, usage, variant, now);
}

export function useAccountView(now: Date = new Date()): AccountView | null {
  const account = useAccountStore((s) => s.account);
  const tier = usePurchases((s) => s.tier);
  const usage = useUsage((s) => s.usage);
  const variant = useUsage((s) => s.variant);
  if (!backendEnabled()) return fixtureView(account);
  return liveView(tier, usage, variant, now);
}

export type DataExport = {
  exportedAt: string;
  account: { name: string; plan: string };
  settings: Settings;
  lifts: string[];
};

export interface AccountRepository {
  get(): Account | null;
  rename(name: string): Promise<void>;
  exportAllData(settings: Settings, liftIds: string[]): Promise<DataExport>;
  deleteAccount(): Promise<void>;
}

export const useAccountStore = create<{ account: Account | null }>(() => ({
  account: { name: 'Alex', signIn: 'apple', synced: true, plan: { tier: 'pull', founding: true } },
}));

export function createLocalAccountRepository(now: () => Date = () => new Date()): AccountRepository {
  return {
    get: () => useAccountStore.getState().account,
    async rename(name) {
      const a = useAccountStore.getState().account;
      if (a) useAccountStore.setState({ account: { ...a, name } });
    },
    async exportAllData(settings, liftIds) {
      const a = accountView(now());
      return {
        exportedAt: now().toISOString(),
        account: { name: a?.name ?? '', plan: a?.plan ?? '' },
        settings,
        lifts: liftIds,
      };
    },
    async deleteAccount() {
      useAccountStore.setState({ account: null });
    },
  };
}

// Everything this device remembers about the lifter, so the next launch starts
// a fresh anonymous account from the first onboarding screen.
export function forgetLocalData(): void {
  useAccountStore.setState({ account: null });
  useOnboarding.getState().reset();
  resetConsentSync();
  useUsage.getState().reset();
  useCapture.setState({ draft: null, movement: 'snatch', lastWeight: '', originals: [] });
  usePurchases.setState({ appUserId: null, customerInfo: null, tier: 'free', period: null, expiresAt: null });
  clearLiveAnalyses();
  useLibraryStore.getState().load(emptyLibrary());
}

export function createAccountRepository(now?: () => Date): AccountRepository {
  return {
    ...createLocalAccountRepository(now),
    async deleteAccount() {
      await deleteRemoteAccount();
      forgetLocalData();
    },
  };
}

export const accountRepository = backendEnabled() ? createAccountRepository() : createLocalAccountRepository();

export function useAccount(): Account | null {
  return useAccountStore((s) => s.account);
}
