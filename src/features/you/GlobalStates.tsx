import { Linking, Text, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { display, fontFamily } from '../../design/typography';
import { Body, DangerBtn, SheetTitle } from '../share/ui';

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

export function OfflineBanner({ queued }: { queued: number }) {
  return (
    <View
      testID="offline-banner"
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: space.s3,
        paddingTop: 14,
        paddingBottom: 10,
        paddingHorizontal: space.gutter,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.hairline,
      }}
    >
      <Text style={{ flex: 1, color: colors.text, fontFamily: fontFamily.body, fontSize: 15, lineHeight: 21 }}>
        Offline. Filming works; analysis will queue.
      </Text>
      {queued > 0 ? (
        <Text style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 12, lineHeight: 16 }}>{`${queued} queued`}</Text>
      ) : null}
    </View>
  );
}

export function LowStorageSheet({
  clips,
  bytes,
  onDelete,
  onNotNow,
}: {
  clips: number;
  bytes: number;
  onDelete: () => void;
  onNotNow: () => void;
}) {
  return (
    <Sheet gap={12} testID="low-storage">
      <SheetTitle size={20}>Phone storage is low</SheetTitle>
      <Body>{`${clips} original clips take ${formatBytes(bytes)}. Analyses, cues and stills stay either way.`}</Body>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        <DangerBtn compact onPress={onDelete} testID="delete-originals">
          Delete originals
        </DangerBtn>
        <Btn compact kind="secondary" style={{ flex: 1 }} onPress={onNotNow} testID="storage-not-now">
          Not now
        </Btn>
      </View>
    </Sheet>
  );
}

export function UpdateRequired({ onUpdate }: { onUpdate: () => void }) {
  return (
    <View testID="update-required" style={{ flex: 1, justifyContent: 'center', padding: space.gutter, gap: space.s3, backgroundColor: colors.bg }}>
      <Text style={[display(30), { color: colors.text }]}>This version can't talk to the analysis service any more.</Text>
      <Body>Update takes a minute. Your lifts are safe.</Body>
      <Btn compact onPress={onUpdate} testID="update-app">
        Update Catchline
      </Btn>
    </View>
  );
}

export type Permission = 'camera' | 'microphone' | 'photos' | 'notifications';

export const PERMISSION_COPY: Record<Permission, { title: string; body: string }> = {
  camera: { title: 'Camera is off for Catchline', body: 'Filming needs it. You can still import a clip from Photos.' },
  microphone: { title: 'Microphone is off', body: 'The voice countdown needs it. Filming works without sound.' },
  photos: { title: 'Photos access is off', body: 'Importing a clip and saving cards need it.' },
  notifications: { title: 'Notifications are off', body: 'No cue reminder and no ping when a lift is analysed.' },
};

// Inline, never a modal: the screen it sits on keeps working.
export function PermissionDenied({ kind, onOpenSettings = () => Linking.openSettings() }: { kind: Permission; onOpenSettings?: () => void }) {
  const copy = PERMISSION_COPY[kind];
  return (
    <View
      testID={`permission-${kind}`}
      style={{ gap: space.s2, paddingVertical: space.s3, paddingHorizontal: space.s4, borderLeftWidth: 2, borderLeftColor: colors.text, backgroundColor: colors.surface }}
    >
      <Text style={{ color: colors.text, fontFamily: fontFamily.bodyBold, fontSize: 15, lineHeight: 21 }}>{copy.title}</Text>
      <Body>{copy.body}</Body>
      <Btn kind="text" onPress={onOpenSettings} testID="open-settings">
        Open Settings
      </Btn>
    </View>
  );
}
