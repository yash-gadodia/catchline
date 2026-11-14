import { useLocalSearchParams, useRouter } from 'expo-router';
import AnalysisPlaceholder from '../../src/features/analysis/AnalysisPlaceholder';
import { t } from '../../src/i18n';
import { liftTitle } from '../../src/features/library/derive';
import LiftDetailsScreen from '../../src/features/library/LiftDetailsScreen';
import { liftKind, useLiftNames } from '../../src/features/library/liftNames';
import { useLibrary } from '../../src/features/library/repository';

// The lifter's name, tags and note for one lift. `id` is the id the player opens it by (its `fixture`).
export default function LiftDetailsRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { lifts } = useLibrary();
  const shapes = useLiftNames((n) => n.shapes);
  const lift = lifts.find((l) => (l.analysisId ?? l.id) === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!id || !lift) return <AnalysisPlaceholder status="missing" onBack={back} />;
  return <LiftDetailsScreen key={id} id={id} kind={liftKind(shapes, id)} title={liftTitle(lift)} back={t('library.details.back')} onBack={back} />;
}
