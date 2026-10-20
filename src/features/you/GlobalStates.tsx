import { Linking, Text, View } from 'react-native';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { display, fontFamily, type } from '../../design/typography';
import { Body, DangerBtn, SheetTitle } from '../share/ui';
import { formatNumber, t, type Key } from '../../i18n';

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${formatNumber(bytes / 1e9, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GB`;
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
      <Text style={{ flex: 1, color: colors.text, ...type.callout }}>
        {t('you.offline.banner')}
      </Text>
      {queued > 0 ? (
        <Text style={{ color: colors.text2, ...type.caption }}>{t('you.offline.queued', { count: queued })}</Text>
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
      <SheetTitle size={20}>{t('you.storage.title')}</SheetTitle>
      <Body>{t('you.storage.body', { count: clips, size: formatBytes(bytes) })}</Body>
      <View style={{ flexDirection: 'row', gap: space.s2 }}>
        <DangerBtn compact onPress={onDelete} testID="delete-originals">
          {t('you.storage.deleteOriginals')}
        </DangerBtn>
        <Btn compact kind="secondary" style={{ flex: 1 }} onPress={onNotNow} testID="storage-not-now">
          {t('you.storage.notNow')}
        </Btn>
      </View>
    </Sheet>
  );
}

export function UpdateRequired({ onUpdate, onBack }: { onUpdate: () => void; onBack?: () => void }) {
  return (
    <View testID="update-required" style={{ flex: 1, justifyContent: 'center', padding: space.gutter, gap: space.s3, backgroundColor: colors.bg }}>
      <Text style={[display(30), { color: colors.text }]}>{t('you.update.title')}</Text>
      <Body>{t('you.update.body')}</Body>
      <Btn onPress={onUpdate} testID="update-app">
        {t('you.update.cta')}
      </Btn>
      {onBack ? (
        <Btn kind="text" onPress={onBack} testID="update-back">
          {t('you.update.back')}
        </Btn>
      ) : null}
    </View>
  );
}

export type Permission = 'camera' | 'microphone' | 'photos' | 'notifications';

export function permissionCopy(kind: Permission): { title: string; body: string } {
  return { title: t(`you.permission.${kind}.title` as Key), body: t(`you.permission.${kind}.body` as Key) };
}

// Inline, never a modal: the screen it sits on keeps working.
export function PermissionDenied({ kind, onOpenSettings = () => Linking.openSettings() }: { kind: Permission; onOpenSettings?: () => void }) {
  const copy = permissionCopy(kind);
  return (
    <View
      testID={`permission-${kind}`}
      style={{ gap: space.s2, paddingVertical: space.s3, paddingHorizontal: space.s4, borderLeftWidth: 2, borderLeftColor: colors.text, backgroundColor: colors.surface }}
    >
      <Text style={{ color: colors.text, ...type.callout, fontFamily: fontFamily.bodyBold }}>{copy.title}</Text>
      <Body>{copy.body}</Body>
      <Btn kind="text" onPress={onOpenSettings} testID="open-settings">
        {t('you.permission.openSettings')}
      </Btn>
    </View>
  );
}
