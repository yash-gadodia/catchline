import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react-native';
import { CaptureStep } from './CaptureStep';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockInvoke = supabase.functions.invoke as jest.Mock;

// Same pollution guard as IntroStep.test: the animated Btn/Press leave state
// that empties later mounts in a file.
jest.mock('../../../components/Btn', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function MockBtn({ children, onPress, disabled, testID }: any) {
    return React.createElement(
      Pressable,
      { onPress: disabled ? undefined : onPress, disabled, testID },
      React.createElement(Text, {}, children)
    );
  };
});
jest.mock('../../../components/Press', () => {
  const React = require('react');
  const { Pressable } = require('react-native');
  return function MockPress({ children, onPress }: any) {
    return React.createElement(Pressable, { onPress }, children);
  };
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 } as any;

function setup() {
  const onRead = jest.fn();
  const onOpenReceipts = jest.fn();
  const onOpenSettings = jest.fn();
  return {
    props: { insets, onRead, onOpenReceipts, onOpenSettings },
    onRead,
    onOpenReceipts,
  };
}

describe('CaptureStep', () => {
  afterEach(cleanup);

  it('opens on the question with the first-launch line', async () => {
    const { props } = setup();
    const { getByText } = await render(<CaptureStep {...props} />);
    expect(getByText('What happened?')).toBeTruthy();
    expect(getByText('Say it or type it. It stays yours.')).toBeTruthy();
  });

  // Nothing greys out: at launch Speak is the only action, and the two named
  // buttons arrive with the first words rather than sitting there dead.
  it('shows no actions until words exist, then submits the account', async () => {
    const { props, onRead } = setup();
    const { getByTestId, queryByTestId } = await render(<CaptureStep {...props} />);

    expect(queryByTestId('capture-read')).toBeNull();
    expect(getByTestId('capture-speak')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(
        getByTestId('capture-input'),
        'He went quiet after the money thing.'
      );
    });
    fireEvent.press(getByTestId('capture-read'));
    expect(onRead).toHaveBeenCalledWith(
      'He went quiet after the money thing.',
      null
    );
  });

  it('a stem tap appends the opener into the account', async () => {
    const { props, onRead } = setup();
    const { getByText, getByTestId } = await render(<CaptureStep {...props} />);

    await act(async () => {
      fireEvent.press(getByText('She said…'));
    });
    fireEvent.press(getByTestId('capture-read'));
    expect(onRead).toHaveBeenCalledWith('She said ', null);
  });

  it('Read it is the only action once words exist', async () => {
    const { props } = setup();
    const { getByTestId, queryByText } = await render(<CaptureStep {...props} />);

    await act(async () => {
      fireEvent.changeText(getByTestId('capture-input'), 'flat all morning');
    });
    expect(getByTestId('capture-read')).toBeTruthy();
    expect(queryByText('Just save')).toBeNull();
  });

  it('a screenshot is transcribed into attached chat lines', async () => {
    const ImagePicker = require('expo-image-picker');
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ base64: 'QUJD', mimeType: 'image/png' }],
    });
    mockInvoke.mockResolvedValueOnce({
      data: { schema: 'transcribe', lines: [{ who: 'Dani', text: 'you hung up on me' }] },
      error: null,
    });
    const { props, onRead } = setup();
    const { getByTestId, findByText } = await render(<CaptureStep {...props} />);

    await act(async () => {
      fireEvent.press(getByTestId('capture-screenshot'));
    });
    expect(mockInvoke).toHaveBeenCalledWith('refocus', {
      body: { schema: 'transcribe', imageBase64: 'QUJD', mediaType: 'image/png' },
    });
    expect(await findByText('Dani')).toBeTruthy();
    fireEvent.press(getByTestId('capture-read'));
    expect(onRead).toHaveBeenCalledWith('', 'Dani: you hung up on me');
  });

  it('an unreadable screenshot says so instead of attaching nothing', async () => {
    const ImagePicker = require('expo-image-picker');
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ base64: 'QUJD', mimeType: 'image/png' }],
    });
    mockInvoke.mockResolvedValueOnce({ data: { schema: 'transcribe', lines: [] }, error: null });
    const { props } = setup();
    const { getByTestId, findByTestId } = await render(<CaptureStep {...props} />);

    await act(async () => {
      fireEvent.press(getByTestId('capture-screenshot'));
    });
    expect((await findByTestId('screenshot-status')).props.children).toBe(
      "Couldn't read a chat in that screenshot. Try a clearer one, or paste the text."
    );
  });

  it('Speak points at keyboard dictation (hint appears, input keeps focus path)', async () => {
    const { props } = setup();
    const { getByTestId } = await render(<CaptureStep {...props} />);

    await act(async () => {
      fireEvent.press(getByTestId('capture-speak'));
    });
    expect(getByTestId('speak-hint').props.children).toContain(
      'Tap the mic on your keyboard'
    );
  });
});
