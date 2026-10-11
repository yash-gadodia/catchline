import { Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import CueDetailScreen, { DidntStickScreen, StuckScreen } from '../../src/features/library/CueDetailScreen';
import { dropCue, keepTrying, markStuck, tryNewCue, useCue } from '../../src/features/library/repository';

// One route per cue; the screen follows its status, so marking it stuck turns
// this screen into the "It stuck" moment in place.
export default function CueRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cue = useCue(id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/cues'));
  if (!cue) return null;
  if (cue.status === 'stuck') {
    return (
      <StuckScreen
        cue={cue}
        nav={{
          onNext: () => router.replace('/cues'),
          onShare: () => Share.share({ message: `Stuck: ${cue.text}. Catchline` }),
        }}
      />
    );
  }
  if (cue.status === 'didnt_stick') {
    return (
      <DidntStickScreen
        cue={cue}
        nav={{
          onBack: back,
          onTryNew: () => {
            const next = tryNewCue(cue.id);
            if (next) router.replace({ pathname: '/cue/[id]', params: { id: next } });
          },
          onKeepTrying: () => keepTrying(cue.id),
          onSendToCoach: () => Share.share({ message: `My cue "${cue.text}" didn't stick after six sessions. Can you take a look?` }),
        }}
      />
    );
  }
  return (
    <CueDetailScreen
      cue={cue}
      nav={{
        onBack: back,
        onStuck: () => markStuck(cue.id),
        onDrop: () => {
          dropCue(cue.id);
          back();
        },
      }}
    />
  );
}
