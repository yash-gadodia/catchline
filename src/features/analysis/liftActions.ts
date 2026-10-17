import { ActionSheetIOS, Alert, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import type { Analysis } from '../../analysis/types';
import { movementLabel } from '../../analysis/format';
import { t } from '../../i18n';

export const REPORT_EMAIL = 'pirsquare.yash+catchline@gmail.com';

export function reportText(analysis: Analysis): string {
  return [
    `Lift: ${analysis.id}`,
    `Movement: ${movementLabel(analysis.movementUsed ?? analysis.movement)}`,
    `Cue: ${analysis.cue?.text ?? 'none'}`,
    `App version: ${Constants.expoConfig?.version ?? 'unknown'}`,
    '',
    'What looks wrong:',
  ].join('\n');
}

export function reportUrl(analysis: Analysis): string {
  return `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Wrong result ${analysis.id}`)}&body=${encodeURIComponent(reportText(analysis))}`;
}

type ReportDeps = {
  open: (url: string) => Promise<unknown>;
  copy: (text: string) => void;
  alert: (title: string, body: string) => void;
};

const REPORT_DEPS: ReportDeps = {
  open: (url) => Linking.openURL(url),
  copy: (text) => void Clipboard.setStringAsync(text).catch(() => undefined),
  alert: (title, body) => Alert.alert(title, body),
};

// A phone with no mail client rejects the mailto, which used to leave the row doing nothing at all (#16).
export async function sendReport(analysis: Analysis, deps: ReportDeps = REPORT_DEPS) {
  try {
    await deps.open(reportUrl(analysis));
  } catch {
    deps.copy(reportText(analysis));
    deps.alert(t('analysis.report.noMailTitle'), t('analysis.report.noMailBody', { email: REPORT_EMAIL }));
  }
}

// The "···" menu on a result. Re-running an analysis is not supported server-side, so the second item films a new set.
// There is no single-lift delete in src/lib/api, so there is no delete item.
export function openLiftActions(analysis: Analysis, on: { onShare: () => void; onFilmAnother: () => void }) {
  const actions = [
    { label: t('analysis.actions.share'), run: on.onShare },
    { label: t('analysis.actions.filmAnother'), run: on.onFilmAnother },
    { label: t('analysis.actions.report'), run: () => void sendReport(analysis) },
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
