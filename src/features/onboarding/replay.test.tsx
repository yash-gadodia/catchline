import { render } from '@testing-library/react-native';
import * as router from 'expo-router';
import WelcomeRoute from '../../../app/onboarding/index';
import { EVENTS, track } from '../../lib/analytics';

jest.mock('../../lib/analytics', () => ({ ...jest.requireActual('../../lib/analytics'), track: jest.fn() }));

afterEach(() => jest.restoreAllMocks());

describe('the welcome, opened again from the You page', () => {
  it('counts a first visit in the welcome funnel', async () => {
    const view = await render(<WelcomeRoute />);
    expect(view.toJSON()).not.toBeNull();
    expect(track).toHaveBeenCalledWith(EVENTS.WELCOME_VIEWED, {});
  });

  it('does not count a replay', async () => {
    (track as jest.Mock).mockClear();
    jest.spyOn(router, 'useLocalSearchParams').mockReturnValue({ replay: '1' });
    const view = await render(<WelcomeRoute />);
    expect(view.toJSON()).not.toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
