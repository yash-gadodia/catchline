import { render, waitFor } from '@testing-library/react-native';
import mock from '../../analysis/fixtures/snatch-mock.json';
import { parseAnalysis } from '../../analysis/parse';
import { putLiveAnalysis } from '../../analysis/live';
import { supabase } from '../../lib/supabase';
import { router as nav } from 'expo-router';
import PlayerRoute from '../../../app/analysis/player';
import ProcessingRoute from '../../../app/analysis/processing';

const params: { current: Record<string, string> } = { current: {} };

jest.mock('expo-router', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const r = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    __esModule: true,
    router: r,
    useRouter: () => r,
    useNavigation: () => ({ setOptions: () => {}, getParent: () => undefined }),
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
const serverAnalysis = (id: string) => ({ ...mock, id, loadKg: 71 });

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
  it('shows a missing state when the server has no analysis for that lift', async () => {
    analysisRow = null;
    params.current = { fixture: liftId(3) };
    const view = await render(<PlayerRoute />);
    resolveRow?.();

    await waitFor(() => expect(view.getByTestId('analysis-missing')).toBeOnTheScreen());
    expect(view.getByText("Couldn't find this lift.")).toBeOnTheScreen();
    expect(view.queryByTestId('phase-name')).toBeNull();
  });

  it('a lift already seen this session renders at once without a fetch', async () => {
    putLiveAnalysis(parseAnalysis(serverAnalysis(liftId(4))));
    params.current = { fixture: liftId(4) };
    const view = await render(<PlayerRoute />);

    expect(view.getByText('Snatch · 71 kg · rep 2')).toBeOnTheScreen();
    expect(view.getByTestId('phase-name')).toHaveTextContent('Setup');
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe('bundled fixtures still open directly', () => {
  it('a bundled fixture id never hits the server', async () => {
    params.current = { fixture: 'snatch-mock-low' };
    const view = await render(<PlayerRoute />);

    expect(view.getByTestId('phase-name')).toHaveTextContent('Setup');
    expect(db.from).not.toHaveBeenCalled();
  });

  it('no id at all is the dev entry and opens the demo', async () => {
    params.current = {};
    const view = await render(<PlayerRoute />);

    expect(view.getByText('Snatch · 62.5 kg · rep 2')).toBeOnTheScreen();
    expect(db.from).not.toHaveBeenCalled();
  });

});

// Prod bug (14-10-2026, TestFlight): every result route reached without an id resolved to
// the bundled demo snatch. In a release build that must never happen.
describe('release build: a result route with no id never plays the demo', () => {
  beforeEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = false;
  });
  afterEach(() => {
    (global as unknown as { __DEV__: boolean }).__DEV__ = true;
  });

  it('player: shows the missing state, not the bundled snatch', async () => {
    params.current = {};
    const view = await render(<PlayerRoute />);

    expect(view.getByTestId('analysis-missing')).toBeOnTheScreen();
    expect(view.getByText("Couldn't find this lift.")).toBeOnTheScreen();
    expect(view.queryByTestId('phase-name')).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  it('processing: goes home instead of animating the demo', async () => {
    params.current = {};
    const view = await render(<ProcessingRoute />);

    expect(nav.replace).toHaveBeenCalledWith('/');
    expect(view.queryByTestId('phase-name')).toBeNull();
  });
});
