import { act, fireEvent, render } from '@testing-library/react-native';
import { snatchMock } from '../../analysis/fixtures';
import type { Analysis, Measurement } from '../../analysis/types';
import { loadLibrary } from '../library/repository';
import PlayerScreen from './PlayerScreen';

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
