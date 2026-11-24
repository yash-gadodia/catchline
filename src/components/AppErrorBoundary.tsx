import { t } from '../i18n';
import React from 'react';
import { View } from 'react-native';
import Text from './Text';
import { colors, space } from '../design/tokens';
import { fontFamily } from '../design/typography';
import Btn from './Btn';
import { captureError } from '../lib/analytics';
import { reportError } from '../lib/sentry';

type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed:', error);
    captureError(error, { screen: 'unknown' });
    reportError(error, { boundary: 'app' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.gutter, gap: 16 }}
      >
        <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 22, lineHeight: 28 }}>
          {t('common.crash.title')}
        </Text>
        <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 17, lineHeight: 24 }}>
          {t('common.crash.body')}
        </Text>
        <Btn kind="secondary" onPress={() => this.setState({ error: null })} testID="error-retry">
          {t('common.launch.retry')}
        </Btn>
      </View>
    );
  }
}
