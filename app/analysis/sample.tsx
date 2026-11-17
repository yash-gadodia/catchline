import { useEffect } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import TrackerScreen from '../../src/features/analysis/TrackerScreen';
import { SAMPLE_ANALYSIS, SAMPLE_BODY, SAMPLE_CLIP } from '../../src/features/onboarding/sample';
import { EVENTS, track } from '../../src/lib/analytics';
import { t } from '../../src/i18n';

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
      // from the welcome screen, back to it: picking a video there is also where the terms are accepted
      onAnother={() => (from === 'import' ? router.replace('/capture/import' as Href) : back())}
    />
  );
}
