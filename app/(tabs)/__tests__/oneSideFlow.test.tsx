import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import RefocusScreen from '../refocus';
import { listReceipts } from '../../../src/features/refocus/receipts';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ONE SIDE integration: capture → working → result (bridge / no-bridge /
// error), with receipts recording what actually happened. ONE_SIDE is true in
// content, so the refocus tab renders the flow directly.

let mockInvoke: jest.Mock;
jest.mock('../../../src/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));
jest.mock('../../../src/features/auth/useSession', () => ({
  useSession: () => ({ session: { user: { id: 'me' } }, loading: false }),
}));
jest.mock('../../../src/features/pairing/useCouple', () => ({
  useCouple: () => ({ couple: null, loading: false, status: 'none' }),
}));
jest.mock('../../../src/features/refocus/useRefocusSession', () => ({
  useRefocusSession: () => ({
    session: null,
    loading: false,
    error: null,
    refresh: jest.fn(() => Promise.resolve()),
  }),
}));

const BRIDGE_DATA = {
  schema: 'v2',
  bridge_decision: 'bridge',
  underneath: 'You were waiting to be asked, not told.',
  not_wrong_about: 'The transfer was a duty, not a secret.',
  bridge: 'I am not angry about the money. I am hurt I heard after.',
  no_bridge: null,
};

const NO_BRIDGE_DATA = {
  schema: 'v2',
  bridge_decision: 'no_bridge',
  underneath: 'A long day, not a rupture.',
  not_wrong_about: 'They were carrying the same flat evening.',
  bridge: '',
  no_bridge: {
    noticed: 'This reads like a flat Tuesday.',
    let_go: 'The honest thing is to let this one go.',
  },
};

async function captureAndRead(screen: Awaited<ReturnType<typeof render>>, words: string) {
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('capture-input'), words);
  });
  await act(async () => {
    fireEvent.press(screen.getByTestId('capture-read'));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockInvoke = jest.fn(() =>
    Promise.resolve({ data: BRIDGE_DATA, error: null })
  );
});

describe('OneSideFlow', () => {
  it('opens on capture and sends the v2 account to the edge fn', async () => {
    const screen = await render(<RefocusScreen />);
    expect(screen.getByText('What happened?')).toBeTruthy();

    await captureAndRead(screen, 'he went quiet after the transfer');

    await waitFor(() =>
      expect(screen.getByTestId('bridge-input')).toBeTruthy()
    );
    expect(mockInvoke).toHaveBeenCalledWith('refocus', {
      body: { schema: 'v2', userText: 'he went quiet after the transfer' },
    });
    expect(screen.getByTestId('bridge-input').props.value).toBe(
      BRIDGE_DATA.bridge
    );
  });

  it('records a read receipt with the outcome, copied=false, sent=null', async () => {
    const screen = await render(<RefocusScreen />);
    await captureAndRead(screen, 'he went quiet');
    await waitFor(() => expect(screen.getByTestId('bridge-input')).toBeTruthy());

    const receipts = await listReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].kind).toBe('read');
    expect(receipts[0].outcome).toBe('bridge');
    expect(receipts[0].copied).toBe(false);
    expect(receipts[0].sentAt).toBeNull();
  });

  it('no-bridge arrives as a first-class result', async () => {
    mockInvoke = jest.fn(() =>
      Promise.resolve({ data: NO_BRIDGE_DATA, error: null })
    );
    const screen = await render(<RefocusScreen />);
    await captureAndRead(screen, 'flat all morning, not sure why');

    await waitFor(() =>
      expect(screen.getByText('There is no bridge here.')).toBeTruthy()
    );
    expect(screen.queryByTestId('copy-bridge')).toBeNull();

    const receipts = await listReceipts();
    expect(receipts[0].outcome).toBe('no_bridge');
  });

  it('a failed read keeps the words on screen with a retry', async () => {
    mockInvoke = jest.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } }));
    const screen = await render(<RefocusScreen />);
    await captureAndRead(screen, 'the words that must not be lost');

    await waitFor(() =>
      expect(screen.getByText(/the words that must not be lost/)).toBeTruthy()
    );
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('Save instead (the 40s hatch) records a saved receipt and resets capture', async () => {
    jest.useFakeTimers();
    mockInvoke.mockReturnValueOnce(new Promise(() => {}));
    const screen = await render(<RefocusScreen />);
    await act(async () => {
      fireEvent.changeText(screen.getByTestId('capture-input'), 'just logging this');
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('capture-read'));
    });
    await act(async () => {
      jest.advanceTimersByTime(40_000);
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('working-save-instead'));
      await jest.runOnlyPendingTimersAsync();
    });
    jest.useRealTimers();

    const receipts = await listReceipts();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].kind).toBe('saved');
    await waitFor(() =>
      expect(screen.getByTestId('capture-input').props.value).toBe('')
    );
  });
});
