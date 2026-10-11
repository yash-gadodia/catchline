import { useLocalSearchParams } from 'expo-router';
import type { Movement } from '../../src/analysis/types';
import { MOVEMENT_METRICS } from '../../src/features/library/metrics';
import TrendsScreen from '../../src/features/library/TrendsScreen';

export default function TrendsRoute() {
  const { movement } = useLocalSearchParams<{ movement?: string }>();
  const initial = movement && movement in MOVEMENT_METRICS ? (movement as Movement) : undefined;
  return <TrendsScreen key={initial ?? 'default'} initialMovement={initial} />;
}
