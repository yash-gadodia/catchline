import { act, fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import Row from './Row';

describe('Row', () => {
  it('draws a bottom hairline by default and keeps the caller padding', async () => {
    const { getByTestId } = await render(
      <Row testID="row" style={{ paddingVertical: 14 }}>
        <Text>Units</Text>
      </Row>,
    );
    expect(getByTestId('row')).toHaveStyle({
      flexDirection: 'row',
      borderTopWidth: 0,
      borderBottomWidth: 1,
      borderColor: '#2E2E2E',
      paddingVertical: 14,
    });
  });

  it('draws both hairlines, or none', async () => {
    const both = await render(<Row testID="both" divider="both" />);
    expect(both.getByTestId('both')).toHaveStyle({ borderTopWidth: 1, borderBottomWidth: 1 });
    const none = await render(<Row testID="none" divider="none" />);
    expect(none.getByTestId('none')).toHaveStyle({ borderTopWidth: 0, borderBottomWidth: 0 });
  });

  it('passes the press through', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(<Row testID="row" onPress={onPress} />);
    await act(async () => {
      fireEvent.press(getByTestId('row'));
    });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
