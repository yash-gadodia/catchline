import { foundingState, getFoundingSeats, localSeats, remoteSeats, seatsFraction, seatsLeftLabel, setSeatsSource } from './seats';
import { QUIZ_LENGTH, quizMovement, quizQuestion } from './quiz';
import { offeringFor, packageIdFor, periodFromProductId, planKey, playSubscriptionId, productIdFor } from './products';
import { cueStatusLabel, proofCuesFrom } from './proofCues';
import { setWebCheckoutOverride, webCheckoutEnabled } from './flags';
import { useUsage } from './usageStore';
import type { CueRecord } from '../library/types';
import { foundingSeats } from '../../lib/api';

jest.mock('../../lib/api', () => ({ ...jest.requireActual('../../lib/api'), foundingSeats: jest.fn() }));
const mockFoundingSeats = foundingSeats as jest.Mock;

describe('founding seats', () => {
  afterEach(() => setSeatsSource(localSeats));

  it('with the backend on, reads the founding_seats RPC', async () => {
    mockFoundingSeats.mockResolvedValueOnce({ taken: 12, cap: 500 });
    expect(await getFoundingSeats()).toEqual({ total: 500, remaining: 488 });
  });

  it('never reports fewer than 0 seats left', async () => {
    mockFoundingSeats.mockResolvedValueOnce({ taken: 503, cap: 500 });
    expect(await remoteSeats.getFoundingSeats()).toEqual({ total: 500, remaining: 0 });
  });

  it('the local stub (fixture mode) reports 137 of 500', async () => {
    setSeatsSource(localSeats);
    expect(await getFoundingSeats()).toEqual({ total: 500, remaining: 137 });
  });

  it('reads through the swappable source', async () => {
    setSeatsSource({ getFoundingSeats: async () => ({ total: 500, remaining: 41 }) });
    expect(await getFoundingSeats()).toEqual({ total: 500, remaining: 41 });
  });

  it('is low under 10% and sold out at 0', () => {
    expect(foundingState({ total: 500, remaining: 137 })).toBe('open');
    expect(foundingState({ total: 500, remaining: 50 })).toBe('open');
    expect(foundingState({ total: 500, remaining: 49 })).toBe('low');
    expect(foundingState({ total: 500, remaining: 1 })).toBe('low');
    expect(foundingState({ total: 500, remaining: 0 })).toBe('soldOut');
  });

  it('labels and fractions', () => {
    expect(seatsLeftLabel({ total: 500, remaining: 137 })).toBe('137 of 500 left');
    expect(seatsFraction({ total: 500, remaining: 125 })).toBe(0.25);
    expect(seatsFraction({ total: 0, remaining: 0 })).toBe(0);
  });
});

describe('quiz', () => {
  it('has four questions, the second shaped by the first', () => {
    expect(QUIZ_LENGTH).toBe(4);
    expect(quizQuestion(0, []).title).toBe('What are you working on?');
    expect(quizQuestion(1, ['Snatch'])).toEqual({
      title: 'Where does your snatch go wrong?',
      options: ['Bar swings out front', 'I miss behind', "Can't get under it", "Not sure, that's the problem"],
    });
    expect(quizQuestion(1, ['Muscle-ups']).title).toBe('Where does your muscle-up go wrong?');
    expect(quizQuestion(2, ['Snatch', 'I miss behind']).title).toBe('How often do you train it?');
    expect(quizQuestion(3, []).title).toBe('Do you film your lifts?');
  });

  it('maps the answer to the movement to film', () => {
    expect(quizQuestion(0, []).options).toEqual(['Snatch', 'Clean and jerk', 'Muscle-ups']);
    expect(quizMovement(['Muscle-ups'])).toBe('muscle-up');
    expect(quizMovement([])).toBe('snatch');
  });
});

describe('products', () => {
  const pullAnnual = { kind: 'sub', tier: 'pull', period: 'annual' } as const;
  const trial = { kind: 'sub', tier: 'pull', period: 'monthly', trial: true } as const;

  it('package ids per offering', () => {
    expect(packageIdFor(pullAnnual)).toBe('pull_annual');
    expect(packageIdFor({ kind: 'sub', tier: 'platform', period: 'monthly' })).toBe('platform_monthly');
    expect(packageIdFor({ kind: 'founding' })).toBe('founding');
    expect(packageIdFor(trial)).toBe('$rc_monthly');
    expect(offeringFor(pullAnnual)).toBe('default');
    expect(offeringFor(trial)).toBe('ad_trial');
  });

  it('store product ids', () => {
    expect(productIdFor(pullAnnual, 'ios')).toBe('catchline_pull_annual');
    expect(productIdFor(pullAnnual, 'android')).toBe('catchline_pull:annual');
    expect(productIdFor(trial, 'ios')).toBe('catchline_pull_monthly_trial7');
    expect(productIdFor(trial, 'android')).toBe('catchline_pull:monthly-trial7');
    expect(productIdFor({ kind: 'founding' }, 'android')).toBe('catchline_founding_lifetime');
    expect(playSubscriptionId('hook')).toBe('catchline_hook');
  });

  it('period from product id', () => {
    expect(periodFromProductId('catchline_pull_annual')).toBe('annual');
    expect(periodFromProductId('catchline_hook:monthly')).toBe('monthly');
    expect(periodFromProductId('catchline_founding_lifetime')).toBeNull();
  });

  it('plan keys', () => {
    expect(planKey(pullAnnual)).toBe('pull_annual');
    expect(planKey(trial)).toBe('pull_monthly_trial');
    expect(planKey({ kind: 'founding' })).toBe('founding');
  });
});

describe('proof cues', () => {
  const cue = (over: Partial<CueRecord>): CueRecord => ({
    id: 'c',
    movement: 'snatch',
    text: 'Stay over the bar longer',
    metricId: 'bar_drift_hip',
    givenAt: '2026-10-01',
    status: 'trying',
    sessionsTarget: 6,
    before: { image: 'asset:snatch/6-catch' },
    after: { image: 'asset:snatch/6-catch' },
    ...over,
  });

  // #13: a lifter with no lifts was shown three stand-in cues as if they were their own.
  it('is empty for a lifter with no cues', () => {
    expect(proofCuesFrom([], [])).toEqual([]);
  });

  it('reads the lifter’s own cues, newest first, with their own counts', () => {
    const cues = [
      cue({ id: 'old', text: 'Finish the pull before you drop', givenAt: '2026-09-01', status: 'stuck' }),
      cue({ id: 'new', givenAt: '2026-10-05', sessionsDone: 3 }),
      cue({ id: 'gone', text: 'Hips to the bar on the MU', givenAt: '2026-09-20', status: 'didnt_stick' }),
    ];
    expect(proofCuesFrom(cues, [])).toEqual([
      { text: 'Stay over the bar longer', status: 'trying', tries: 3, of: 6 },
      { text: 'Hips to the bar on the MU', status: 'didnt' },
      { text: 'Finish the pull before you drop', status: 'stuck' },
    ]);
  });

  it('keeps only the three newest', () => {
    const cues = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d, i) =>
      cue({ id: `c${i}`, givenAt: d, status: 'stuck' })
    );
    expect(proofCuesFrom(cues, [])).toHaveLength(3);
  });

  it('labels each status', () => {
    expect(cueStatusLabel({ text: 'x', status: 'didnt' })).toBe("Didn't stick");
    expect(cueStatusLabel({ text: 'x', status: 'dropped' })).toBe('Dropped');
    expect(cueStatusLabel({ text: 'x', status: 'trying' })).toBe('Trying');
  });
});

describe('web checkout flag', () => {
  afterEach(() => setWebCheckoutOverride(null));

  it('is off by default and can be overridden', () => {
    expect(webCheckoutEnabled()).toBe(false);
    setWebCheckoutOverride(true);
    expect(webCheckoutEnabled()).toBe(true);
  });
});

describe('usage store', () => {
  beforeEach(() => useUsage.getState().reset());

  it('records analyses through the entitlement model', () => {
    const oct = new Date(2026, 9, 11);
    useUsage.getState().record('free', oct);
    useUsage.getState().record('free', oct);
    useUsage.getState().record('pull', oct);
    expect(useUsage.getState().usage).toEqual({ lifetime: 3, month: '2026-10', thisMonth: 1 });
  });

  it('queues a clip once and hands it back first in, first out', () => {
    const s = useUsage.getState();
    s.queueClip({ id: 'a', movement: 'snatch' });
    s.queueClip({ id: 'a', movement: 'snatch' });
    s.queueClip({ id: 'b', movement: 'clean' });
    expect(useUsage.getState().queue).toEqual([
      { id: 'a', movement: 'snatch' },
      { id: 'b', movement: 'clean' },
    ]);
    expect(useUsage.getState().takeQueued()).toEqual({ id: 'a', movement: 'snatch' });
    expect(useUsage.getState().queue).toEqual([{ id: 'b', movement: 'clean' }]);
    useUsage.getState().takeQueued();
    expect(useUsage.getState().takeQueued()).toBeNull();
  });

  it('sets the funnel variant', () => {
    useUsage.getState().setVariant('ad');
    expect(useUsage.getState().variant).toBe('ad');
  });
});
