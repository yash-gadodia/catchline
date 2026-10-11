import { create } from 'zustand';
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

// SIM: local store until Phase 3 wires Supabase auth + an edge function that
// deletes server rows within 24 h.
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
      const a = useAccountStore.getState().account;
      return {
        exportedAt: now().toISOString(),
        account: { name: a?.name ?? '', plan: a ? planLabel(a.plan) : '' },
        settings,
        lifts: liftIds,
      };
    },
    async deleteAccount() {
      useAccountStore.setState({ account: null });
    },
  };
}

export const accountRepository = createLocalAccountRepository();

export function useAccount(): Account | null {
  return useAccountStore((s) => s.account);
}
