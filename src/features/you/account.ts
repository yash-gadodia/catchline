import { create } from 'zustand';
import { clearLiveAnalyses } from '../../analysis/live';
import { backendEnabled, resetConsentSync } from '../../data/backend';
import { deleteAllLocalLifts } from '../../data/localLifts';
import { useLiftOutbox } from '../../data/liftOutbox';
import { deleteAccount as deleteRemoteAccount } from '../../lib/api';
import { signOut as endSession } from '../auth/appleSignIn';
import { NO_USER, useAuthUser, type AuthUser } from '../auth/authUser';
import { useCapture } from '../capture/store';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import { useOnboarding } from '../onboarding/store';
import { FREE_PER_WEEK, freeLeft, type Tier, type Usage } from '../paywall/entitlements';
import { useUsage } from '../paywall/usageStore';
import { t } from '../../i18n';
import { usePurchases } from '../purchases/usePurchases';
import type { CsvLift } from './liftsCsv';
import type { Settings } from './settings';

export type Account = {
  name: string;
  signIn: 'apple' | 'google' | 'email';
  synced: boolean;
  tier: Tier;
};

function signInName(s: Account['signIn']): string {
  return s === 'email' ? t('you.account.email') : s === 'apple' ? 'Apple' : 'Google';
}

// Free shows this week's videos; every paid tier, old or new, is Catchline Pro.
export function planLabel(tier: Tier, usage: Usage, now: Date): string {
  if (tier === 'free') return `${t('you.plan.free')} · ${t('you.plan.videosLeft', { left: freeLeft(usage, now), total: FREE_PER_WEEK })}`;
  return `${t('you.plan.pro')} · ${t(tier === 'founding' ? 'you.plan.foundingMember' : 'you.plan.unlimited')}`;
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

// What the You tab shows. name is null while the account is anonymous, or when
// Apple gave no name; anonymous is true until the lifter signs in with Apple.
export type AccountView = { name: string | null; line: string; plan: string; founding: boolean; anonymous: boolean };

function fixtureView(a: Account | null, usage: Usage, now: Date): AccountView | null {
  return a ? { name: a.name, line: accountLine(a), plan: planLabel(a.tier, usage, now), founding: a.tier === 'founding', anonymous: false } : null;
}

function liveView(auth: AuthUser, tier: Tier, usage: Usage, now: Date): AccountView {
  return {
    name: auth.anonymous ? null : auth.displayName,
    line: auth.anonymous ? anonymousLine() : appleLine(),
    plan: planLabel(tier, usage, now),
    founding: tier === 'founding',
    anonymous: auth.anonymous,
  };
}

export function accountView(now: Date = new Date()): AccountView | null {
  const usage = useUsage.getState().usage;
  if (!backendEnabled()) return fixtureView(useAccountStore.getState().account, usage, now);
  return liveView(useAuthUser.getState(), usePurchases.getState().tier, usage, now);
}

export function useAccountView(now: Date = new Date()): AccountView | null {
  const account = useAccountStore((s) => s.account);
  const auth = useAuthUser();
  const tier = usePurchases((s) => s.tier);
  const usage = useUsage((s) => s.usage);
  if (!backendEnabled()) return fixtureView(account, usage, now);
  return liveView(auth, tier, usage, now);
}

export type ExportedLift = {
  id: string;
  date: string;
  movement: string;
  loadKg?: number;
  reps?: number;
  status: string;
  cue?: string;
  measurements: { id: string; label: string; value: number; unit: string }[];
  analysisVersion?: string;
};

export type DataExport = {
  exportedAt: string;
  account: { name: string; plan: string };
  settings: Settings;
  lifts: ExportedLift[];
};

// Each lift as the lifter saw it: what, when, the cue, and every measurement the clip could see (as the CSV export).
export function exportedLift({ lift, analysis }: CsvLift): ExportedLift {
  return {
    id: lift.id,
    date: lift.date,
    movement: lift.movement,
    loadKg: lift.loadKg,
    status: lift.status,
    cue: analysis?.cue?.text,
    measurements: (analysis?.measurements ?? [])
      .filter((m) => m.status !== 'not_seen')
      .map((m) => ({ id: m.id, label: m.label, value: m.value, unit: m.unit })),
    analysisVersion: analysis?.analysisVersion,
  };
}

export interface AccountRepository {
  get(): Account | null;
  rename(name: string): Promise<void>;
  exportAllData(settings: Settings, lifts: CsvLift[]): Promise<DataExport>;
  deleteAccount(): Promise<void>;
}

export const useAccountStore = create<{ account: Account | null }>(() => ({
  account: { name: 'Alex', signIn: 'apple', synced: true, tier: 'founding' },
}));

export function createLocalAccountRepository(now: () => Date = () => new Date()): AccountRepository {
  return {
    get: () => useAccountStore.getState().account,
    async rename(name) {
      const a = useAccountStore.getState().account;
      if (a) useAccountStore.setState({ account: { ...a, name } });
    },
    async exportAllData(settings, lifts) {
      const a = accountView(now());
      return {
        exportedAt: now().toISOString(),
        account: { name: a?.name ?? '', plan: a?.plan ?? '' },
        settings,
        lifts: lifts.map(exportedLift),
      };
    },
    async deleteAccount() {
      useAccountStore.setState({ account: null });
    },
  };
}

// Everything this device holds for the current account, so the next backend
// call starts a fresh anonymous one (ensureSession). Onboarding answers stay.
export function leaveAccount(): void {
  useAuthUser.setState(NO_USER);
  resetConsentSync();
  useUsage.getState().reset();
  useCapture.setState({ draft: null, lastWeight: '', originals: [] });
  usePurchases.getState().signOut();
  clearLiveAnalyses();
  useLibraryStore.getState().load(emptyLibrary());
}

// Everything this device remembers about the lifter, so the next launch starts
// a fresh anonymous account from the first onboarding screen.
export function forgetLocalData(): void {
  leaveAccount();
  // the delete sheet promises every lift goes: the clips and tracking on this phone, and any record not yet synced
  deleteAllLocalLifts();
  useLiftOutbox.setState({ items: [] });
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
