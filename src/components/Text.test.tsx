import { render } from '@testing-library/react-native';
import Text from './Text';

describe('Text', () => {
  it('caps Dynamic Type at 1.5x, so the largest accessibility sizes cannot break a layout', async () => {
    const { getByText } = await render(<Text style={{ color: '#FFFFFF' }}>Lifts</Text>);
    expect(getByText('Lifts')).toHaveProp('maxFontSizeMultiplier', 1.5);
    expect(getByText('Lifts')).toHaveStyle({ color: '#FFFFFF' });
  });

  it('lets a caller set its own cap', async () => {
    const { getByText } = await render(<Text maxFontSizeMultiplier={1.2}>12:30</Text>);
    expect(getByText('12:30')).toHaveProp('maxFontSizeMultiplier', 1.2);
  });
});
