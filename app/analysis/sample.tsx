import { useEffect } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import TrackerScreen from '../../src/features/analysis/TrackerScreen';
import { SAMPLE_ANALYSIS, SAMPLE_BODY, SAMPLE_CLIP } from '../../src/features/onboarding/sample';
import { EVENTS, track } from '../../src/lib/analytics';
import { t } from '../../src/i18n';
import { useOnboarding } from '../../src/features/onboarding/store';

// The bundled lift (the one the welcome screen plays) in the real player, for someone with no lift video on their
// phone yet: its first look, the result card, then every control. Nothing is saved and no free video is used.
export default function SampleRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  useEffect(() => {
    track(EVENTS.SAMPLE_OPENED, { from: from === 'import' ? 'import' : 'welcome' });
  }, []);
  return (
    <TrackerScreen
      analysis={SAMPLE_ANALYSIS}
      clipUri={SAMPLE_CLIP}
      body={SAMPLE_BODY}
      title={t('analysis.reveal.sample.title')}
      onBack={back}
      reveal
      sample
      // straight to the picker: the welcome screen accepted the terms when the sample was opened (#237)
      onAnother={() => {
        if (from !== 'import') useOnboarding.getState().complete();
        router.replace('/capture/import' as Href);
      }}
    />
  );
}
