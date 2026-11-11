import { File } from 'expo-file-system';
import { setLanguage } from '../../i18n';
import { freeVideosLabel, isTracked, liftDetail, liftLink, liftTitle, liftWhen, newestFirst, sessionsDone } from './derive';
import { emptyLibrary } from './seed';
import type { CueRecord, Lift, Session } from './types';

jest.mock('expo-file-system', () => {
  const kept = new Set<string>();
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
  }
  class File extends Directory {
    static kept = kept;
    get exists() {
      return [...kept].some((id) => this.uri.includes(`/${id}/`) && this.uri.endsWith('clip.mp4'));
    }
  }
  return { Directory, File, Paths: { document: { uri: 'file:///docs' } } };
});

const kept = (File as unknown as { kept: Set<string> }).kept;

// 11 Nov 2026, 14:32 on this phone's clock, whatever its time zone.
const AT = new Date(2026, 10, 11, 14, 32).toISOString();
const lift = (over: Partial<Lift> = {}): Lift => ({ id: 'l1', movement: 'snatch', date: '2026-11-11', at: AT, status: 'done', analysisId: 'l1', ...over });

beforeEach(() => kept.clear());
afterEach(() => setLanguage('en'));

describe('free videos chip', () => {
  it('counts down the three lifetime videos', () => {
    expect(freeVideosLabel(emptyLibrary())).toBe('3 free videos');
    expect(freeVideosLabel({ plan: 'free', freeVideosUsed: 2 })).toBe('1 free video left');
    expect(freeVideosLabel({ plan: 'free', freeVideosUsed: 3 })).toBe('Free videos used');
    expect(freeVideosLabel({ plan: 'paid', freeVideosUsed: 3 })).toBeNull();
  });
});

describe('a lift row', () => {
  it('is titled by its date and time, with the load only when the lifter set one', () => {
    expect(liftWhen(lift())).toBe('11 Nov, 14:32');
    expect(liftTitle(lift())).toBe('11 Nov, 14:32');
    expect(liftTitle(lift({ loadKg: 62.5 }))).toBe('11 Nov, 14:32 · 62.5 kg');
    expect(liftTitle(lift({ at: undefined, loadKg: 60 }))).toBe('11 Nov · 60 kg');
  });

  it('writes the date the way the language does', () => {
    setLanguage('de');
    expect(liftTitle(lift({ loadKg: 62.5 }))).toBe('11. Nov, 14:32 · 62,5 kg');
  });

  it('lists the newest first, by time within a day', () => {
    const morning = lift({ id: 'a', at: new Date(2026, 10, 11, 9, 5).toISOString() });
    const afternoon = lift({ id: 'b' });
    const yesterday = lift({ id: 'c', date: '2026-11-10', at: undefined });
    expect(newestFirst([yesterday, morning, afternoon]).map((l) => l.id)).toEqual(['b', 'a', 'c']);
  });

  it('never names a movement on a 4.0 lift (its clip is kept); a 3.x lift keeps the one the lifter picked', () => {
    kept.add('l1');
    expect(isTracked(lift())).toBe(true);
    expect(liftDetail(lift())).toBeNull();
    kept.clear();
    expect(isTracked(lift())).toBe(false);
    expect(liftDetail(lift({ movement: 'clean' }))).toBe('Clean');
  });

  it('says what is happening to a lift that is not finished', () => {
    expect(liftDetail(lift({ status: 'processing' }))).toBe('tracking');
    expect(liftDetail(lift({ status: 'queued' }))).toBe('Queued · free videos used');
    expect(liftDetail(lift({ status: 'failed' }))).toBe("Couldn't track it");
    expect(liftDetail(lift({ status: 'failed', failure: { reason: 'unsupported_movement', message: 'Could not find a person in this clip.' } }))).toBe(
      'Could not find a person in this clip.',
    );
  });

  it('opens a finished lift on the player and a failed one on its failure, and nothing while it runs', () => {
    expect(liftLink(lift())).toEqual({ pathname: '/analysis/player', params: { fixture: 'l1' } });
    expect(liftLink(lift({ status: 'failed' }))).toEqual({ pathname: '/failure/[id]', params: { id: 'l1' } });
    expect(liftLink(lift({ status: 'processing' }))).toBeNull();
    expect(liftLink(lift({ status: 'queued' }))).toBeNull();
    expect(liftLink(lift({ analysisId: undefined }))).toBeNull();
  });
});

describe('sessionsDone (the paywall proof rows)', () => {
  const cue: CueRecord = {
    id: 'c1',
    movement: 'snatch',
    text: 'Stay over the bar longer',
    metricId: 'bar_drift_hip',
    givenAt: '2026-09-30',
    status: 'trying',
    sessionsTarget: 6,
    before: { image: '' },
    after: { image: '' },
  };
  const session = (date: string, movement: Session['movement'] = 'snatch'): Session => ({ id: `s-${date}`, movement, date, values: {} });

  it('prefers the server session count over counting local sessions', () => {
    expect(sessionsDone({ ...cue, sessionsDone: 5 }, [session('2026-10-02')])).toBe(5);
  });

  it('counts the sessions of the movement filmed after the cue was given, up to its end', () => {
    const sessions = [session('2026-09-30'), session('2026-10-02'), session('2026-10-04'), session('2026-10-05', 'clean'), session('2026-10-20')];
    expect(sessionsDone(cue, sessions)).toBe(3);
    expect(sessionsDone({ ...cue, endedAt: '2026-10-04' }, sessions)).toBe(2);
  });
});
