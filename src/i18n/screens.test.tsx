import { render } from '@testing-library/react-native';
import CuesScreen from '../features/library/CuesScreen';
import { emptyLibrary } from '../features/library/seed';
import { useLibraryStore } from '../features/library/store';
import type { CueRecord } from '../features/library/types';
import PrivacyScreen from '../features/onboarding/PrivacyScreen';
import YouScreen from '../features/you/YouScreen';
import { setLanguage } from './index';

jest.mock('../data/backend', () => ({ backendEnabled: () => false }));

const nav = { onDemo: jest.fn(), onWhatIsStored: jest.fn(), onDeleteAccount: jest.fn(), onPlan: jest.fn(), onReport: jest.fn(), onWhatsNew: jest.fn(), onHelp: jest.fn() };

const cue: CueRecord = {
  id: 'c1',
  movement: 'snatch',
  text: 'Land on the line you started on.',
  why: 'Your feet landed 9 cm in front of where they started.',
  metricId: 'jump_forward',
  givenAt: '2026-10-10',
  status: 'trying',
  sessionsTarget: 6,
  sessionsDone: 3,
  firstLiftId: 'l1',
  lastLiftId: 'l1',
  before: { image: '' },
  after: { image: '' },
};

afterEach(() => setLanguage('en'));

describe.each([
  ['es', 'Tú', 'Idioma', 'Indicaciones', 'Aterriza en la línea donde empezaste.', 'Qué pasa con tu vídeo', 'La indicación es una estimación de IA, no un consejo médico.'],
  ['de', 'Du', 'Sprache', 'Hinweise', 'Lande auf der Linie, auf der du gestartet bist.', 'Was mit deinem Video passiert', 'Der Hinweis ist eine KI-Schätzung, kein medizinischer Rat.'],
] as const)('screens in %s', (locale, you, language, cuesTitle, cueText, privacyTitle, estimate) => {
  beforeEach(() => setLanguage(locale));

  it('You tab', async () => {
    const screen = await render(<YouScreen nav={nav} version="3.0.1" />);
    expect(screen.getByText(you)).toBeOnTheScreen();
    expect(screen.getByText(language)).toBeOnTheScreen();
    expect(screen.queryByText('Units')).toBeNull();
  });

  it('Cues tab, with the worker cue translated by fault id', async () => {
    useLibraryStore.getState().load({ ...emptyLibrary(), today: '2026-10-14', cues: [cue], sessions: [] });
    const screen = await render(<CuesScreen onOpen={jest.fn()} />);
    expect(screen.getAllByText(cuesTitle).length).toBe(1);
    expect(screen.getByText(cueText)).toBeOnTheScreen();
    expect(screen.queryByText(cue.text)).toBeNull();
  });

  it('privacy consent', async () => {
    const screen = await render(<PrivacyScreen onContinue={jest.fn()} />);
    expect(screen.getByText(privacyTitle)).toBeOnTheScreen();
    expect(screen.getByText(estimate)).toBeOnTheScreen();
  });
});
