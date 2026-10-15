import { ActionSheetIOS, Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import type { Analysis } from '../../analysis/types';
import { movementLabel } from '../../analysis/format';

export const REPORT_EMAIL = 'pirsquare.yash+catchline@gmail.com';

export function reportUrl(analysis: Analysis): string {
  const body = [
    `Lift: ${analysis.id}`,
    `Movement: ${movementLabel(analysis.movementUsed ?? analysis.movement)}`,
    `Cue: ${analysis.cue?.text ?? 'none'}`,
    `App version: ${Constants.expoConfig?.version ?? 'unknown'}`,
    '',
    'What looks wrong:',
  ].join('\n');
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Wrong result ${analysis.id}`)}&body=${encodeURIComponent(body)}`;
}

// The "···" menu on a result. Re-running an analysis is not supported server-side, so the second item films a new set.
// There is no single-lift delete in src/lib/api, so there is no delete item.
export function openLiftActions(analysis: Analysis, on: { onShare: () => void; onFilmAnother: () => void }) {
  const actions = [
    { label: 'Share', run: on.onShare },
    { label: 'Film another set', run: on.onFilmAnother },
    { label: 'Report a wrong result', run: () => void Linking.openURL(reportUrl(analysis)) },
  ];
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...actions.map((a) => a.label), 'Cancel'], cancelButtonIndex: actions.length },
      (i) => actions[i]?.run()
    );
    return;
  }
  Alert.alert('This lift', undefined, actions.map((a) => ({ text: a.label, onPress: a.run })), { cancelable: true });
}
