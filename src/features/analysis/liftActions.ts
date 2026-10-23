import { ActionSheetIOS, Alert, Platform } from 'react-native';
import type { Analysis } from '../../analysis/types';
import { movementLabel } from '../../analysis/format';
import { t } from '../../i18n';

// What the report screen files alongside the lifter's words when it is opened from a lift.
export function reportContext(analysis: Analysis): string {
  return `${movementLabel(analysis.movementUsed ?? analysis.movement)} · cue: ${analysis.cue?.text ?? 'none'}`;
}

export function reportHref(analysis: Analysis) {
  return { pathname: '/report', params: { lift: analysis.id, context: reportContext(analysis) } } as const;
}

// The "···" menu on a result. Re-running an analysis is not supported server-side, so the second item films a new set.
// There is no single-lift delete in src/lib/api, so there is no delete item.
export function openLiftActions(analysis: Analysis, on: { onShare: () => void; onFilmAnother: () => void; onReport: () => void }) {
  const actions = [
    { label: t('analysis.actions.share'), run: on.onShare },
    { label: t('analysis.actions.filmAnother'), run: on.onFilmAnother },
    { label: t('analysis.actions.report'), run: on.onReport },
  ];
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: [...actions.map((a) => a.label), t('analysis.actions.cancel')], cancelButtonIndex: actions.length },
      (i) => actions[i]?.run()
    );
    return;
  }
  Alert.alert(t('analysis.actions.title'), undefined, actions.map((a) => ({ text: a.label, onPress: a.run })), { cancelable: true });
}
