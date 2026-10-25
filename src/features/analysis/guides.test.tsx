import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMock } from '../../analysis/fixtures';
import type { Analysis, Measurement } from '../../analysis/types';
import { loadLibrary } from '../library/repository';
import CueScreen from './CueScreen';
import PathReplay from './PathReplay';
import PlayerScreen from './PlayerScreen';
import { resultNumbers } from './ResultNumbers';

const row = (id: string, value: number, unit: Measurement['unit'] = 'cm', status: Measurement['status'] = 'normal'): Measurement => ({ id, label: id, value, unit, frame: 120, status, note: '' });
const RING_FRAME = 446;

// snatch-mock with the on-device coaching guides and key numbers (best rep 2 holds the cue).
function guided(keyNumbers: string[], extra: Measurement[] = []): Analysis {
  return {
    ...snatchMock,
    keyNumbers,
    measurements: [...snatchMock.measurements, row('max_forward_drift', 8.2), row('bar_crash', 11.4), row('catch_height', 92.4), ...extra],
    reps: snatchMock.reps.map((r) => ({ ...r, guides: { startX: r.path[0].x, kneeY: 0.72, hipY: 0.58, peakY: 0.3, ring: { frame: RING_FRAME, x: 0.71, y: 0.45 } } })),
  };
}
const ALL = ['max_forward_drift', 'bar_forward_off_hips', 'bar_crash', 'jump_forward', 'catch_height'];
const nav = { onTry: jest.fn(), onNotForMe: jest.fn(), onBack: jest.fn(), onFilmAgain: jest.fn() };
const noop = () => {};

beforeEach(() => loadLibrary('seeded'));

describe('the coaching guides in the player', () => {
  it('draws the knee, hip and peak lines and the ring at the furthest-forward bar', async () => {
    const { getByTestId } = await render(<PlayerScreen analysis={guided(ALL)} onBack={noop} onShare={noop} />);
    for (const id of ['guides', 'guide-knee', 'guide-hip', 'guide-peak', 'guide-ring']) expect(getByTestId(id)).toBeOnTheScreen();
  });

  it('leaves the ring out when the drift was not measured with confidence', async () => {
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={guided(['catch_height'])} onBack={noop} onShare={noop} />);
    expect(getByTestId('guide-hip')).toBeOnTheScreen();
    expect(queryByTestId('guide-ring')).toBeNull();
  });

  it('hides them with the lines toggle, and has none on an analysis made before guides', async () => {
    const view = await render(<PlayerScreen analysis={guided(ALL)} onBack={noop} onShare={noop} />);
    await act(async () => fireEvent.press(view.getByTestId('toggle-lines')));
    expect(view.queryByTestId('guides')).toBeNull();
    const old = await render(<PlayerScreen analysis={snatchMock} onBack={noop} onShare={noop} />);
    expect(old.queryByTestId('guides')).toBeNull();
  });
});

describe('the result hero: the bar-path replay', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('steps through the key frames drawing the path, the ring once the bar reaches it, then holds and loops', async () => {
    const a = guided(ALL);
    const rep = a.reps[1];
    const view = await render(<PathReplay analysis={a} rep={rep} box={{ width: 390, height: 390 }} pathTestID="hero-path" reduceMotion={false} />);
    expect(view.getByTestId('stage-layer-asset:snatch/1-setup')).toBeOnTheScreen();
    expect(view.queryByTestId('guide-ring')).toBeNull();
    await act(async () => jest.advanceTimersByTime(450 * 4));
    expect(view.getByTestId('stage-layer-asset:snatch/5-turnover')).toBeOnTheScreen();
    expect(view.getByTestId('guide-ring')).toBeOnTheScreen();
    expect(view.getByTestId('replay-drawn')).toBeOnTheScreen();
    await act(async () => jest.advanceTimersByTime(450 * 2));
    expect(view.getByTestId('stage-layer-asset:snatch/7-recovery')).toBeOnTheScreen();
    expect(view.queryByTestId('replay-drawn')).toBeNull();
    await act(async () => jest.advanceTimersByTime(450 * 4));
    expect(view.getByTestId('stage-layer-asset:snatch/1-setup')).toBeOnTheScreen();
  });

  it('holds the whole path on the last frame with reduced motion', async () => {
    const a = guided(ALL);
    const view = await render(<PathReplay analysis={a} rep={a.reps[1]} box={{ width: 390, height: 390 }} pathTestID="hero-path" reduceMotion />);
    expect(view.getByTestId('stage-layer-asset:snatch/7-recovery')).toBeOnTheScreen();
    expect(view.getByTestId('hero-path')).toBeOnTheScreen();
    expect(view.getByTestId('guide-ring')).toBeOnTheScreen();
  });

  it('is the hero of every result, the cue keeping its number and its low-confidence label', async () => {
    const a = guided(ALL);
    const clear = await render(<CueScreen analysis={a} nav={nav} />);
    expect(clear.getByTestId('path-replay')).toBeOnTheScreen();
    expect(clear.getByTestId('hero-number')).toHaveTextContent('6 cm');
    const low = await render(<CueScreen analysis={{ ...a, cue: { ...a.cue!, confidence: 'low' } }} nav={nav} />);
    expect(low.getByTestId('confidence-banner')).toHaveTextContent(/^Low confidence/);
    expect(low.getByTestId('path-replay')).toBeOnTheScreen();
    expect(low.getByTestId('dashed-path')).toBeOnTheScreen();
    const clean = await render(<CueScreen analysis={{ ...a, cue: null }} nav={nav} />);
    expect(clean.getByTestId('clean-path')).toBeOnTheScreen();
    expect(clean.getByTestId('result-numbers')).toBeOnTheScreen();
    const partial = await render(<CueScreen analysis={{ ...a, cue: null, noCueReason: { code: 'plate_hidden' } }} nav={nav} />);
    expect(partial.getByTestId('partial-path')).toBeOnTheScreen();
  });
});

describe('the key numbers under the replay', () => {
  it('lists the confident ones in order, the feet as forward or back, then the speeds', async () => {
    const forward = guided(ALL, [row('bar_forward_off_hips', 6)]);
    expect(resultNumbers(forward).map((r) => `${r.label}: ${r.value}`)).toEqual([
      'Max forward drift: 8.2 cm',
      'Hip loop: 6 cm',
      'Crash depth: 11.4 cm',
      'Feet: 3 cm forward',
      'Catch height: 92.4 cm',
      'Peak bar speed: 1.82 m/s',
    ]);
    const back = { ...forward, measurements: forward.measurements.map((m) => (m.id === 'jump_forward' ? { ...m, value: -4 } : m)) };
    expect(resultNumbers(back).find((r) => r.id === 'jump_forward')?.value).toBe('4 cm back');
    const { getByTestId } = await render(<CueScreen analysis={forward} nav={nav} />);
    expect(getByTestId('result-number-jump_forward')).toHaveTextContent('FEET3 cm forward');
  });

  it('leaves out what was not measured with confidence, and shows only speed on an older analysis', () => {
    const unsure = guided(['max_forward_drift', 'catch_height'], []);
    unsure.measurements = unsure.measurements.map((m) => (m.id === 'max_forward_drift' ? { ...m, status: 'not_seen' } : m));
    expect(resultNumbers(unsure).map((r) => r.id)).toEqual(['catch_height', 'bar_speed']);
    expect(resultNumbers(snatchMock).map((r) => r.id)).toEqual(['bar_speed']);
    expect(resultNumbers({ ...snatchMock, measurements: [] })).toEqual([]);
  });
});

describe('guides saved with a missing keypoint', () => {
  it('skips the lines and ring that came back null from the saved JSON', async () => {
    const a = guided(ALL);
    const holes = JSON.parse(JSON.stringify({ ...a, reps: a.reps.map((r) => ({ ...r, guides: { ...r.guides!, kneeY: NaN, startX: NaN, ring: { frame: 446, x: NaN, y: NaN } } })) })) as Analysis;
    const { getByTestId, queryByTestId } = await render(<PlayerScreen analysis={holes} onBack={noop} onShare={noop} />);
    expect(queryByTestId('guide-knee')).toBeNull();
    expect(queryByTestId('guide-ring')).toBeNull();
    expect(getByTestId('guide-hip')).toBeOnTheScreen();
  });
});
