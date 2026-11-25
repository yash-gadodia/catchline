import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import TrackerScreen from '../../src/features/analysis/TrackerScreen';
import { SAMPLE_ANALYSIS, SAMPLE_BODY, SAMPLE_CLIP } from '../../src/features/onboarding/sample';
import SampleTour from '../../src/features/onboarding/SampleTour';
import { learnOpen } from '../../src/features/learn/lifts';
import { EVENTS, track } from '../../src/lib/analytics';
import { t } from '../../src/i18n';
import { useOnboarding } from '../../src/features/onboarding/store';

// The bundled lift (the one the welcome screen plays) as a three-step tour: the video, the plate found on it, then the
// real player with its first look, the result card and every control. Nothing is saved and no free video is used.
export default function SampleRoute() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const router = useRouter();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const [toured, setToured] = useState(false);
  useEffect(() => {
    track(EVENTS.SAMPLE_OPENED, { from: from === 'import' ? 'import' : 'welcome' });
  }, []);
  if (!toured) return <SampleTour onTrack={() => setToured(true)} />;
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
      onLearn={
        learnOpen()
          ? () => {
              if (from !== 'import') {
                useOnboarding.getState().complete();
                if (router.canDismiss()) router.dismissAll();
              }
              router.replace('/learn' as Href);
            }
          : undefined
      }
      onAnother={() => {
        if (from !== 'import') {
          useOnboarding.getState().complete();
          // the welcome is still under this screen: without it gone, Cancel in the picker lands back on it
          if (router.canDismiss()) router.dismissAll();
        }
        router.replace('/capture/import' as Href);
      }}
    />
  );
}
