import { create } from 'zustand';
import { clearLiveAnalyses } from '../../analysis/live';
import { backendEnabled, resetConsentSync } from '../../data/backend';
import { deleteAccount as deleteRemoteAccount } from '../../lib/api';
import { signOut as endSession } from '../auth/appleSignIn';
import { NO_USER, useAuthUser, type AuthUser } from '../auth/authUser';
import { useCapture } from '../capture/store';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import { useOnboarding } from '../onboarding/store';
import {
  FREE_VIDEOS as FREE_BY_VARIANT,
  MONTHLY_CAP,
  videosRemaining,
  type Tier as LiveTier,
  type Usage,
  type Variant,
} from '../paywall/entitlements';
import { useUsage } from '../paywall/usageStore';
import { formatDate, t } from '../../i18n';
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

// Hook, Pull and Platform are product names and stay as they are in every language.
const PRODUCT_NAMES = { hook: 'Hook', pull: 'Pull', platform: 'Platform' } as const;

function tierName(tier: Tier | LiveTier): string {
  if (tier === 'free') return t('you.plan.free');
  if (tier === 'founding') return t('you.plan.foundingMember');
  return PRODUCT_NAMES[tier];
}

function signInName(s: Account['signIn']): string {
  return s === 'email' ? t('you.account.email') : s === 'apple' ? 'Apple' : 'Google';
}

// Founding is a one-off purchase: Pull for life, so there is no renewal date to show.
export function planLabel(plan: Plan): string {
  if (plan.tier === 'free') {
    const left = Math.max(0, FREE_VIDEOS - plan.videosUsed);
    return `${tierName('free')} · ${t('you.plan.videosLeft', { left, total: FREE_VIDEOS })}`;
  }
  const name = tierName(plan.tier);
  if (plan.founding) return `${name} · ${t('you.plan.foundingMember')} · ${t('you.plan.forLife')}`;
  const d = new Date(plan.renewsOn);
  const renews = t('you.plan.renews', { day: d.getUTCDate(), month: formatDate(d, { month: 'short', timeZone: 'UTC' }) });
  return `${name} · ${PRICES[plan.tier][plan.billing]} · ${renews}`;
}

export function isFounding(plan: Plan): boolean {
  return plan.tier !== 'free' && plan.founding;
}

export function accountLine(a: Account): string {
  return `${t('you.account.signedInWith', { provider: signInName(a.signIn) })}${a.synced ? ` · ${t('you.account.synced')}` : ''}`;
}

export function anonymousLine(): string {
  return t('you.account.anonymous');
}

export function appleLine(): string {
  return t('you.account.signedInWith', { provider: 'Apple' });
}

// With a backend the plan is the RevenueCat tier and the allowance is the usage
// store's count against the tier's cap (the server enforces the real cap).
export function livePlanLabel(tier: LiveTier, usage: Usage, variant: Variant, now: Date): string {
  const left = videosRemaining(tier, usage, now, variant);
  if (tier === 'free') return `${tierName('free')} · ${t('you.plan.videosLeft', { left, total: FREE_BY_VARIANT[variant] })}`;
  return `${tierName(tier)} · ${t('you.plan.videosLeftMonth', { left, total: MONTHLY_CAP[tier] })}`;
}

// What the You tab shows. name is null while the account is anonymous, or when
// Apple gave no name; anonymous is true until the lifter signs in with Apple.
export type AccountView = { name: string | null; line: string; plan: string; founding: boolean; anonymous: boolean };

function fixtureView(a: Account | null): AccountView | null {
  return a ? { name: a.name, line: accountLine(a), plan: planLabel(a.plan), founding: isFounding(a.plan), anonymous: false } : null;
}

function liveView(auth: AuthUser, tier: LiveTier, usage: Usage, variant: Variant, now: Date): AccountView {
  return {
    name: auth.anonymous ? null : auth.displayName,
    line: auth.anonymous ? anonymousLine() : appleLine(),
    plan: livePlanLabel(tier, usage, variant, now),
    founding: tier === 'founding',
    anonymous: auth.anonymous,
  };
}

export function accountView(now: Date = new Date()): AccountView | null {
  if (!backendEnabled()) return fixtureView(useAccountStore.getState().account);
  const { usage, variant } = useUsage.getState();
  return liveView(useAuthUser.getState(), usePurchases.getState().tier, usage, variant, now);
}

export function useAccountView(now: Date = new Date()): AccountView | null {
  const account = useAccountStore((s) => s.account);
  const auth = useAuthUser();
  const tier = usePurchases((s) => s.tier);
  const usage = useUsage((s) => s.usage);
  const variant = useUsage((s) => s.variant);
  if (!backendEnabled()) return fixtureView(account);
  return liveView(auth, tier, usage, variant, now);
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

// Everything this device holds for the current account, so the next backend
// call starts a fresh anonymous one (ensureSession). Onboarding answers stay;
// the account step is offered again.
export function leaveAccount(): void {
  useAuthUser.setState(NO_USER);
  useOnboarding.getState().setAccountChoice(null);
  resetConsentSync();
  useUsage.getState().reset();
  useCapture.setState({ draft: null, movement: 'snatch', lastWeight: '', originals: [] });
  usePurchases.getState().signOut();
  clearLiveAnalyses();
  useLibraryStore.getState().load(emptyLibrary());
}

// Everything this device remembers about the lifter, so the next launch starts
// a fresh anonymous account from the first onboarding screen.
export function forgetLocalData(): void {
  leaveAccount();
  useAccountStore.setState({ account: null });
  useOnboarding.getState().reset();
}

export async function signOutOfAccount(): Promise<void> {
  await endSession();
  leaveAccount();
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
