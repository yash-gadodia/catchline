import { render } from '@testing-library/react-native';
import PrivacyScreen from '../features/onboarding/PrivacyScreen';
import YouScreen from '../features/you/YouScreen';
import { setLanguage } from './index';

jest.mock('../data/backend', () => ({ backendEnabled: () => false }));

const nav = { onDemo: jest.fn(), onWhatIsStored: jest.fn(), onDeleteAccount: jest.fn(), onPlan: jest.fn(), onReport: jest.fn(), onWhatsNew: jest.fn() };

afterEach(() => setLanguage('en'));

describe.each([
  ['es', 'Tú', 'Idioma', 'Qué pasa con tu vídeo', 'Medimos posiciones, no caras.'],
  ['de', 'Du', 'Sprache', 'Was mit deinem Video passiert', 'Wir messen Positionen, keine Gesichter.'],
] as const)('screens in %s', (locale, you, language, privacyTitle, estimate) => {
  beforeEach(() => setLanguage(locale));

  it('You tab', async () => {
    const screen = await render(<YouScreen nav={nav} />);
    expect(screen.getByText(you)).toBeOnTheScreen();
    expect(screen.getByText(language)).toBeOnTheScreen();
    expect(screen.queryByText('Units')).toBeNull();
  });

  it('privacy consent', async () => {
    const screen = await render(<PrivacyScreen onContinue={jest.fn()} />);
    expect(screen.getByText(privacyTitle)).toBeOnTheScreen();
    expect(screen.getByText(estimate)).toBeOnTheScreen();
  });
});
