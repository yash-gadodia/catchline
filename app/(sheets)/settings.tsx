import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, Alert, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Btn from '../../src/components/Btn';
import Press from '../../src/components/Press';
import { Serif } from '../../src/components/Text';
import TopBar from '../../src/components/TopBar';
import { colors, space } from '../../src/design/tokens';
import { fontFamily } from '../../src/design/typography';
import { usePurchases } from '../../src/features/purchases/usePurchases';
import { signOut } from '../../src/features/auth/authActions';
import { isHapticsEnabled, setHapticsEnabled } from '../../src/lib/haptics';
import {
  listReceipts,
  purgeReceipts,
  clearDraft,
} from '../../src/features/refocus/receipts';

// ONE SIDE settings — quiet by default. The two things that matter here are
// the ones a privacy-positioned app must actually honour: take everything
// with you in a plain format, and delete everything for real.

function Row({
  label,
  sub,
  right,
  onPress,
  danger,
  testID,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  danger?: boolean;
  testID?: string;
}) {
  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 15,
        paddingHorizontal: 18,
        minHeight: 44,
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text
          testID={testID}
          style={{
            fontSize: 16,
            color: danger ? colors.p1Deep : colors.ink,
            fontFamily: fontFamily.ui,
          }}
        >
          {label}
        </Text>
        {sub ? (
          <Text
            style={{
              fontSize: 12.5,
              lineHeight: 12.5 * 1.4,
              color: colors.inkSoft,
              fontFamily: fontFamily.ui,
              marginTop: 3,
            }}
          >
            {sub}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Text style={{ color: colors.inkMute }}>›</Text> : null)}
    </View>
  );
  if (!onPress) return body;
  return (
    <Press onPress={onPress} scale={false}>
      {body}
    </Press>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: 22,
        marginTop: 18,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export default function Settings() {
  const router = useRouter();
  const isPro = usePurchases((s) => s.isPro);
  const [haptics, setHaptics] = useState(isHapticsEnabled);
  const [notifications, setNotifications] = useState(false);

  const exportAll = async () => {
    const rows = await listReceipts();
    if (!rows.length) {
      Alert.alert('Nothing to export yet.');
      return;
    }
    const body = rows
      .map((r) => {
        const state = r.sentAt
          ? 'sent'
          : r.copied
            ? 'copied'
            : r.kind === 'saved'
              ? 'saved only'
              : (r.outcome ?? 'read');
        return `${new Date(r.at).toLocaleString()} — ${state}\n${r.snippet}\n`;
      })
      .join('\n');
    await Share.share({ message: `Parallax — everything you logged\n\n${body}` });
  };

  const deleteAll = () => {
    Alert.alert(
      'Delete everything?',
      'Every entry and every bridge, off this phone. There is no undo, and no copy kept anywhere.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete it all',
          style: 'destructive',
          onPress: async () => {
            await purgeReceipts();
            await clearDraft();
            Alert.alert('Deleted.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }}>
      <TopBar title="settings" onBack={() => router.back()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          paddingTop: 80,
          paddingBottom: 40,
        }}
      >
        <Serif s={28} style={{ lineHeight: 28 * 1.13 }}>
          Quiet by default.
        </Serif>

        <Group>
          <Row
            label="Notifications"
            sub="Off. The app never reminds you to fight."
            right={
              <Switch
                testID="settings-notifications"
                value={notifications}
                onValueChange={setNotifications}
              />
            }
          />
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Row
            label="Haptics"
            right={
              <Switch
                testID="settings-haptics"
                value={haptics}
                onValueChange={(v) => {
                  setHaptics(v);
                  setHapticsEnabled(v);
                }}
              />
            }
          />
        </Group>

        <Group>
          <Row
            testID="settings-plus"
            label={isPro ? 'Parallax Plus' : 'Get Parallax Plus'}
            sub={
              isPro
                ? 'Active. Manage in the App Store.'
                : 'The read after a fight is always free.'
            }
            onPress={() =>
              router.push(isPro ? '/manageSub' : '/(sheets)/plus')
            }
          />
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Row
            testID="settings-profile"
            label="Your name"
            sub="Only used to address you."
            onPress={() => router.push('/editProfile')}
          />
        </Group>

        <Group>
          <Row
            testID="settings-export"
            label="Export everything"
            sub="Plain text, yours to keep. No lock-in."
            onPress={exportAll}
          />
          <View style={{ height: 1, backgroundColor: colors.line }} />
          <Row
            testID="settings-delete"
            label="Delete everything"
            sub="Every entry and every bridge, off this phone."
            danger
            onPress={deleteAll}
          />
        </Group>

        <Text
          style={{
            fontSize: 12.5,
            lineHeight: 12.5 * 1.5,
            color: colors.inkSoft,
            fontFamily: fontFamily.ui,
            marginTop: 18,
          }}
        >
          Entries are read once by a model to write the reply, then returned.
          Not privileged the way a doctor or a lawyer is. &quot;Just save&quot;
          entries never leave this phone.
        </Text>

        <View style={{ marginTop: 24 }}>
          <Btn
            kind="soft"
            testID="settings-signout"
            onPress={async () => {
              await signOut();
              router.replace('/');
            }}
          >
            Sign out
          </Btn>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
