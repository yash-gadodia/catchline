import { useEffect } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Btn from '../../src/components/Btn';
import { colors, space } from '../../src/design/tokens';
import { display, type } from '../../src/design/typography';
import { backendEnabled } from '../../src/data/backend';
import { syncLibrary } from '../../src/data/library';
import CueDetailScreen, { DidntStickScreen, StuckScreen } from '../../src/features/library/CueDetailScreen';
import { dropCue, keepTrying, markDidntStick, markStuck, tryNewCue, useCue } from '../../src/features/library/repository';
import { useLibraryStore } from '../../src/features/library/store';
import { captureHref } from '../../src/features/paywall/hooks';
import { t } from '../../src/i18n';
import { cueText } from '../../src/i18n/cues';

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
            <Text style={[display(32), { color: colors.text, textAlign: 'center' }]}>{t('library.cueRoute.goneTitle')}</Text>
            <Text style={{ color: colors.text2, ...type.callout, textAlign: 'center' }}>
              {t('library.cueRoute.goneBody')}
            </Text>
            <Btn kind="secondary" onPress={back} testID="cue-missing-back">
              {t('library.cueRoute.back')}
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
          onShare: () => Share.share({ message: t('library.cueRoute.shareStuck', { cue: cueText(cue.metricId, cue.text) }) }),
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
        }}
      />
    );
  }
  return (
    <CueDetailScreen
      cue={cue}
      nav={{
        onBack: back,
        onRetest: () => router.push(captureHref(`/capture?retest=${cue.id}`) as Href),
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
