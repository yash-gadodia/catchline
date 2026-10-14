import { useEffect } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Btn from '../../src/components/Btn';
import { colors, space } from '../../src/design/tokens';
import { display, fontFamily } from '../../src/design/typography';
import { backendEnabled } from '../../src/data/backend';
import { syncLibrary } from '../../src/data/library';
import CueDetailScreen, { DidntStickScreen, StuckScreen } from '../../src/features/library/CueDetailScreen';
import { dropCue, keepTrying, markDidntStick, markStuck, tryNewCue, useCue } from '../../src/features/library/repository';
import { useLibraryStore } from '../../src/features/library/store';

// One route per cue; the screen follows its status, so marking it stuck turns
// this screen into the "It stuck" moment in place. A cue the store does not
// have yet (deep link, relaunch) is fetched from the server first.
export default function CueRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cue = useCue(id);
  const synced = useLibraryStore((s) => s.synced);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/cues'));

  useEffect(() => {
    if (!cue && backendEnabled()) syncLibrary().catch(() => undefined);
  }, [cue, id]);

  if (!cue) {
    const loading = backendEnabled() && !synced;
    return (
      <View
        style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingHorizontal: space.gutter, alignItems: 'center', justifyContent: 'center', gap: space.s4 }}
        testID={loading ? 'cue-loading' : 'cue-missing'}
      >
        {loading ? (
          <ActivityIndicator color={colors.text2} />
        ) : (
          <>
            <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>This cue is gone.</Text>
            <Text style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21, textAlign: 'center' }}>
              It is no longer on your account.
            </Text>
            <Btn kind="secondary" onPress={back} testID="cue-missing-back">
              Back to cues
            </Btn>
          </>
        )}
      </View>
    );
  }
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
        onDidntStick: () => markDidntStick(cue.id),
        onDrop: () => {
          dropCue(cue.id);
          back();
        },
      }}
    />
  );
}
