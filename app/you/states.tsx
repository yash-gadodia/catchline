import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../src/components/SmallCaps';
import { colors, space } from '../../src/design/tokens';
import { fontFamily } from '../../src/design/typography';
import {
  LowStorageSheet,
  OfflineBanner,
  PermissionDenied,
  UpdateRequired,
  type Permission,
} from '../../src/features/you/GlobalStates';
import { NOTIFICATION_COPY, NOTIFICATION_TITLE } from '../../src/features/you/notificationCopy';

const PERMISSIONS: Permission[] = ['camera', 'microphone', 'photos', 'notifications'];

// Dev gallery for the global states; ?show=update opens the full-screen block.
export default function GlobalStatesRoute() {
  const { show } = useLocalSearchParams<{ show?: string }>();
  const insets = useSafeAreaInsets();
  const [storage, setStorage] = useState(show === 'storage');
  if (show === 'update') return <UpdateRequired onUpdate={() => {}} />;
  const notes = [NOTIFICATION_COPY.cueReminder('Stay over the bar longer'), NOTIFICATION_COPY.analysed, NOTIFICATION_COPY.queuedAnalysed];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <OfflineBanner queued={2} />
      <ScrollView contentContainerStyle={{ padding: space.gutter, gap: space.s4, paddingBottom: 320 }}>
        <SmallCaps>Permission denied, inline</SmallCaps>
        {PERMISSIONS.map((p) => (
          <PermissionDenied key={p} kind={p} />
        ))}
        <SmallCaps>Notification copy</SmallCaps>
        {notes.map((n) => (
          <View key={n} style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: space.s3, gap: 2 }}>
            <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 15, lineHeight: 20 }}>{NOTIFICATION_TITLE}</Text>
            <Text style={{ color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 20 }}>{n}</Text>
          </View>
        ))}
        <Text onPress={() => setStorage(true)} style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 22, textDecorationLine: 'underline' }}>
          Show low storage
        </Text>
      </ScrollView>
      {storage ? <LowStorageSheet clips={38} bytes={4.1e9} onDelete={() => setStorage(false)} onNotNow={() => setStorage(false)} /> : null}
    </View>
  );
}
