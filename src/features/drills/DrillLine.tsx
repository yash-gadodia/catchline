import { Text } from 'react-native';
import { colors } from '../../design/tokens';
import { type } from '../../design/typography';
import { drillFor } from './drills';
import { drillVisible, useDrillsFlag } from './flag';
import { isKey, t } from '../../i18n';

// One standard drill under the cue ("Drill: tall snatch"); the full drill card replaces it once that card shows.
export default function DrillLine({ faultId }: { faultId?: string }) {
  const flag = useDrillsFlag();
  const key = `drills.line.${faultId}`;
  const card = drillFor(faultId);
  if (!faultId || !isKey(key) || (card && drillVisible(card, flag))) return null;
  return (
    <Text testID="drill-line" style={{ color: colors.text, ...type.callout }}>
      {t('drills.line', { drill: t(key) })}
    </Text>
  );
}
