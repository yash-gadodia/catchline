import { create } from 'zustand';
import { clearLiveAnalyses } from '../../analysis/live';
import { backendEnabled, resetConsentSync } from '../../data/backend';
import { deleteAllLocalLifts, readLocalBody } from '../../data/localLifts';
import { sweepClipCache } from '../../data/clipCache';
import type { Body } from '../../analysis/device/tracking';
import type { Analysis, Phase, RepTracks, TracePoint } from '../../analysis/types';
import { useLiftOutbox } from '../../data/liftOutbox';
import { deleteAccount as deleteRemoteAccount } from '../../lib/api';
import { signOut as endSession } from '../auth/appleSignIn';
import { NO_USER, useAuthUser, type AuthUser } from '../auth/authUser';
import { useCapture } from '../capture/store';
import { emptyLibrary } from '../library/seed';
import { useLibraryStore } from '../library/store';
import { kindIdOf, useLiftNames } from '../library/liftNames';
import { detailsOf, useLiftDetails } from '../library/liftDetails';
import { useOnboarding } from '../onboarding/store';
import { FREE_PER_WEEK, freeLeft, type Tier, type Usage } from '../paywall/entitlements';
import { useUsage } from '../paywall/usageStore';
import { t } from '../../i18n';
import { usePurchases } from '../purchases/usePurchases';
import type { CsvLift } from './liftsCsv';
import { useSettings, type Settings } from './settings';

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
  if (tier === 'free') return `${t('you.plan.free')} · ${t('you.plan.videosLeft', { count: FREE_PER_WEEK, left: freeLeft(usage, now), total: FREE_PER_WEEK })}`;
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
  name?: string;
  tags?: string[];
  note?: string;
  cue?: string;
  measurements: { id: string; label: string; value: number; unit: string }[];
  analysisVersion?: string;
  tracking?: ExportedTracking;
  body?: { joints: string[]; frames: (number | null)[][] };
};

// What the phone tracked: per rep the bar path (the hips for a hanging movement), the joint tracks beside it, the
// phases and the file names of the stills kept with it (in the lift's folder on this phone).
export type ExportedTracking = {
  fps: number;
  traceKind: Analysis['traceKind'];
  reps: {
    index: number;
    startFrame: number;
    endFrame: number;
    made: boolean;
    phases: Phase[];
    path: TracePoint[];
    tracks?: RepTracks;
    stills: string[];
  }[];
};

// body.json holds x, y for each of these joints on every frame (BODY_JOINTS in src/analysis/device/tracking.ts).
export const BODY_JOINT_NAMES = [
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel', 'left_big_toe', 'right_big_toe',
];

function exportedTracking(analysis: Analysis): ExportedTracking {
  return {
    fps: analysis.video.fps,
    traceKind: analysis.traceKind,
    reps: analysis.reps.map((r) => ({
      index: r.index,
      startFrame: r.startFrame,
      endFrame: r.endFrame,
      made: r.made,
      phases: r.phases,
      path: r.path,
      ...(r.tracks ? { tracks: r.tracks } : {}),
      stills: r.keyFrames.flatMap((k) => (k.image ? [k.image.slice(k.image.lastIndexOf('/') + 1)] : [])),
    })),
  };
}

export type DataExport = {
  exportedAt: string;
  account: { name: string; plan: string };
  settings: Settings;
  lifts: ExportedLift[];
};

// Each lift as the lifter saw it: what (the kind Lifts shows), when, what they wrote about it, the cue, every
// measurement the clip could see (as the CSV export), and what the phone tracked: the path, the joints, the stills.
export function exportedLift({ lift, analysis }: CsvLift, body: Body | null = null): ExportedLift {
  const key = lift.analysisId ?? lift.id;
  const { name, tags, note } = detailsOf(useLiftDetails.getState().details, key);
  return {
    id: lift.id,
    date: lift.date,
    movement: kindIdOf(useLiftNames.getState(), key) ?? lift.movement,
    loadKg: lift.loadKg,
    status: lift.status,
    ...(name ? { name } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(note ? { note } : {}),
    cue: analysis?.cue?.text,
    measurements: (analysis?.measurements ?? [])
      .filter((m) => m.status !== 'not_seen')
      .map((m) => ({ id: m.id, label: m.label, value: m.value, unit: m.unit })),
    analysisVersion: analysis?.analysisVersion,
    ...(analysis && !analysis.failure ? { reps: analysis.reps.length, tracking: exportedTracking(analysis) } : {}),
    ...(body ? { body: { joints: BODY_JOINT_NAMES, frames: body.frames } } : {}),
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

export function createLocalAccountRepository(
  now: () => Date = () => new Date(),
  readBody: (liftId: string) => Promise<Body | null> = readLocalBody,
): AccountRepository {
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
        lifts: await Promise.all(lifts.map(async (l) => exportedLift(l, await readBody(l.lift.analysisId ?? l.lift.id)))),
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
  useUsage.getState().forgetAccount();
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
  sweepClipCache({ cameraOriginals: true });
  useLiftOutbox.setState({ items: [] });
  useLiftNames.setState({ shapes: {}, chosen: {} });
  useLiftDetails.setState({ details: {} });
  useAccountStore.setState({ account: null });
  useOnboarding.getState().reset();
  useSettings.getState().reset();
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
