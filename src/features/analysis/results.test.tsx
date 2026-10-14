import { render, waitFor } from '@testing-library/react-native';
import mock from '../../analysis/fixtures/snatch-mock.json';
import { parseAnalysis } from '../../analysis/parse';
import { putLiveAnalysis } from '../../analysis/live';
import { supabase } from '../../lib/supabase';
import { router as nav } from 'expo-router';
import CueRoute from '../../../app/analysis/cue';
import RevealRoute from '../../../app/analysis/reveal';
import PlayerRoute from '../../../app/analysis/player';
import MissRoute from '../../../app/analysis/miss';
import ProcessingRoute from '../../../app/analysis/processing';
import CompareRoute from '../../../app/analysis/compare';
import { snatchMockMiss } from '../../analysis/fixtures';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    __esModule: true,
    router: r,
    useRouter: () => r,
    useLocalSearchParams: () => params.current,
    Redirect: ({ href }: { href: string }) => React.createElement(Text, { testID: 'redirect' }, href),
  };
});

jest.mock('../../lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    from: jest.fn(),
    storage: { from: jest.fn() },
    auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'jwt-1', user: { id: 'u1' } } } })) },
  },
}));

const db = supabase as unknown as { from: jest.Mock; storage: { from: jest.Mock } };

// Real lift ids (the worker writes Analysis.id = lift id); one per test, since a
// fetched analysis stays in the session's live map.
const liftId = (n: number) => `0f4b6c2e-6f47-4c0a-9d3e-2a5b8c1d7e9${n}`;
const SERVER_CUE = 'Hips rose early off the floor';
const serverAnalysis = (id: string) => ({ ...mock, id, cue: { ...mock.cue, text: SERVER_CUE } });

let analysisRow: unknown = null;
let resolveRow: (() => void) | null = null;

function analysesQuery() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) q[m] = () => q;
  q.maybeSingle = () =>
    new Promise((resolve) => {
      resolveRow = () => resolve({ data: analysisRow, error: null });
    });
  return q;
}

beforeEach(() => {
  jest.clearAllMocks();
  params.current = {};
  analysisRow = null;
  resolveRow = null;
  db.from.mockImplementation(() => analysesQuery());
  db.storage.from.mockReturnValue({ createSignedUrls: jest.fn(async () => ({ data: [], error: null })) });
});

// Prod bug (14-10-2026): a result route opened with a lift id the app had not seen this
// session rendered the bundled demo snatch instead of that lift's own analysis.
describe('result routes opened with a live lift id', () => {
  it('cue: loads that lift from the server, never the demo', async () => {
    analysisRow = { analysis: serverAnalysis(liftId(1)) };
    params.current = { fixture: liftId(1) };
    const view = await render(<CueRoute />);

    expect(view.getByTestId('analysis-loading')).toBeOnTheScreen();
    expect(view.queryByText(mock.cue.text)).toBeNull();
    expect(db.from).toHaveBeenCalledWith('analyses');

    resolveRow?.();
    await waitFor(() => expect(view.getByTestId('cue-screen')).toBeOnTheScreen());
    expect(view.getByText(SERVER_CUE)).toBeOnTheScreen();
    expect(view.queryByText(mock.cue.text)).toBeNull();
  });

  it('reveal: shows a loading state until the server answers', async () => {
    analysisRow = { analysis: serverAnalysis(liftId(2)) };
    params.current = { fixture: liftId(2) };
    const view = await render(<RevealRoute />);

    expect(view.getByTestId('analysis-loading')).toBeOnTheScreen();
    expect(view.queryByTestId('reveal-screen')).toBeNull();

    resolveRow?.();
    await waitFor(() => expect(view.getByTestId('reveal-screen')).toBeOnTheScreen());
  });

  it('shows a missing state when the server has no analysis for that lift', async () => {
    analysisRow = null;
    params.current = { fixture: liftId(3) };
    const view = await render(<PlayerRoute />);
    resolveRow?.();

    await waitFor(() => expect(view.getByTestId('analysis-missing')).toBeOnTheScreen());
    expect(view.getByText("Couldn't find this lift.")).toBeOnTheScreen();
    expect(view.queryByText(mock.cue.text)).toBeNull();
  });

  it('a lift already seen this session renders at once without a fetch', async () => {
    putLiveAnalysis(parseAnalysis(serverAnalysis(liftId(4))));
    params.current = { fixture: liftId(4) };
    const view = await render(<CueRoute />);

    expect(view.getByTestId('cue-screen')).toBeOnTheScreen();
    expect(view.getByText(SERVER_CUE)).toBeOnTheScreen();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('bundled fixtures still open directly', () => {
  it('a bundled fixture id never hits the server', async () => {
    params.current = { fixture: 'snatch-mock-low' };
    const view = await render(<CueRoute />);

    expect(view.getByTestId('low-confidence')).toBeOnTheScreen();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('no id at all is the dev entry and opens the demo', async () => {
    params.current = {};
    const view = await render(<CueRoute />);

    expect(view.getByText(mock.cue.text)).toBeOnTheScreen();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('compare and its buttons stay available in a dev build', async () => {
    params.current = { fixture: 'snatch-mock', mode: 'ghost' };
    const compare = await render(<CompareRoute />);
    expect(compare.queryByTestId('redirect')).toBeNull();
    expect(compare.getByText('vs Your best · 65 kg · 18 Sep')).toBeOnTheScreen();

    params.current = { fixture: 'snatch-mock' };
    const player = await render(<PlayerRoute />);
    expect(player.getByTestId('player-compare')).toBeOnTheScreen();
  });
});

// Prod bug (14-10-2026, TestFlight): any result route reached without an id resolved to
// the bundled demo snatch. In a release build that must never happen.
describe('release build: a result route with no id never plays the demo', () => {
  beforeEach(() => {
    (global as { __DEV__: boolean }).__DEV__ = false;
  });
  afterEach(() => {
    (global as { __DEV__: boolean }).__DEV__ = true;
  });

  it.each([
    ['cue', CueRoute],
    ['reveal', RevealRoute],
    ['player', PlayerRoute],
    ['miss', MissRoute],
  ])('%s: shows the missing state, not the bundled snatch', async (_name, Route) => {
    params.current = {};
    const view = await render(<Route />);

    expect(view.getByTestId('analysis-missing')).toBeOnTheScreen();
    expect(view.getByText("Couldn't find this lift.")).toBeOnTheScreen();
    expect(view.queryByText(mock.cue.text)).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('processing: goes home instead of animating the demo', async () => {
    params.current = {};
    const view = await render(<ProcessingRoute />);

    expect(nav.replace).toHaveBeenCalledWith('/');
    expect(view.queryByText(mock.cue.text)).toBeNull();
  });

  // Compare's "Your best" / "Last session" are fixture variants of the demo snatch, not the
  // lifter's history. Until it has real targets it is a dev preview only.
  it('compare: redirects home even for a real lift', async () => {
    putLiveAnalysis(parseAnalysis(serverAnalysis(liftId(5))));
    params.current = { fixture: liftId(5), mode: 'ghost' };
    const view = await render(<CompareRoute />);

    expect(view.getByTestId('redirect')).toHaveTextContent('/');
    expect(view.queryByText('vs Your best · 65 kg · 18 Sep')).toBeNull();
  });

  it('player and miss hide their Compare buttons', async () => {
    putLiveAnalysis(parseAnalysis(serverAnalysis(liftId(6))));
    params.current = { fixture: liftId(6) };
    const player = await render(<PlayerRoute />);
    expect(player.getByTestId('player-share')).toBeOnTheScreen();
    expect(player.queryByTestId('player-compare')).toBeNull();

    putLiveAnalysis({ ...snatchMockMiss, id: liftId(7) });
    params.current = { fixture: liftId(7) };
    const miss = await render(<MissRoute />);
    expect(miss.getByTestId('miss-screen')).toBeOnTheScreen();
    expect(miss.queryByTestId('miss-compare')).toBeNull();
  });

  it('the sample lift still opens, labelled as the sample', async () => {
    params.current = { fixture: 'snatch-sample' };
    const view = await render(<CueRoute />);

    expect(view.getByText('SAMPLE LIFT · AI ESTIMATE')).toBeOnTheScreen();
    expect(db.from).not.toHaveBeenCalled();
  });
});
