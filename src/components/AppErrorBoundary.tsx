import React from 'react';
import { Text, View } from 'react-native';
import { colors, space } from '../design/tokens';
import { fontFamily } from '../design/typography';
import Btn from './Btn';
import { captureError } from '../lib/analytics';

type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
    captureError(error, { screen: 'unknown' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.gutter, gap: 16 }}
      >
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
          Something broke on our side
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
          Your lift is safe. Try again.
        </Text>
        <Btn kind="secondary" onPress={() => this.setState({ error: null })} testID="error-retry">
          Try again
        </Btn>
      </View>
    );
  }
}
