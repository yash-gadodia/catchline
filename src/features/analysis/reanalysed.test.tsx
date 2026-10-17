import { render } from '@testing-library/react-native';
import { snatchMock, snatchMockLow } from '../../analysis/fixtures';
import { useLocale } from '../../i18n';
import { loadLibrary } from '../library/repository';
import CueScreen from './CueScreen';

const nav = { onTry: jest.fn(), onNotForMe: jest.fn(), onBack: jest.fn(), onFilmAgain: jest.fn() };
const at = '2026-10-16T08:30:00Z';

beforeEach(() => {
  loadLibrary('seeded');
  useLocale.setState({ locale: 'en' });
});

describe('re-analysed line', () => {
  it('says when a lift was re-run, on the confident, low-confidence and no-cue layouts', async () => {
    for (const analysis of [snatchMock, snatchMockLow, { ...snatchMock, cue: null }]) {
      const { getByTestId } = await render(<CueScreen analysis={{ ...analysis, reanalysedAt: at }} nav={nav} />);
      expect(getByTestId('reanalysed')).toHaveTextContent('Re-analysed on Oct 16, 2026 with the improved analysis');
    }
  });

  it('is absent on a lift analysed once', async () => {
    const { queryByTestId } = await render(<CueScreen analysis={snatchMock} nav={nav} />);
    expect(queryByTestId('reanalysed')).toBeNull();
  });

  it('follows the app language', async () => {
    useLocale.setState({ locale: 'de' });
    const { getByTestId } = await render(<CueScreen analysis={{ ...snatchMock, reanalysedAt: at }} nav={nav} />);
    expect(getByTestId('reanalysed')).toHaveTextContent('Am 16. Okt. 2026 mit der verbesserten Analyse neu ausgewertet');
  });
});
