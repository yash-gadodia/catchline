import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  ViewStyle,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets  } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { safeBack } from "../src/lib/nav";
import { colors, gradients, radius, shadows, space } from '../src/design/tokens';
import { fontFamily } from '../src/design/typography';
import { Kick } from '../src/components/Text';
import TopBar from '../src/components/TopBar';
import Tok from '../src/components/Tok';
import Btn from '../src/components/Btn';
import Toast from '../src/components/Toast';
import { DawnBlobs } from '../src/components/DawnBlobs';
import { useProfile } from '../src/features/profile/useProfile';
import { ONE_SIDE } from '../src/content/refocus';

export default function EditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name: profileName, partnerName, togetherSince, updateProfile } = useProfile();
  const [name, setName] = useState('');
  const [since, setSince] = useState('');
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(profileName);
    setSince(togetherSince || 'February 2024');
  }, [profileName, togetherSince]);

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      await updateProfile(name, since);
      setToastMsg('Changes saved');
      setTimeout(() => {
        setToastMsg(null);
        safeBack(router);
      }, 2000);
    } catch {
      setSaving(false);
      setToastMsg("couldn't save that — try again in a sec");
      setTimeout(() => setToastMsg(null), 2200);
    }
  };

  const handleBack = () => {
    safeBack(router);
  };

  // Field component for editable text inputs
  const Field = ({
    label,
    value,
    onChange,
    readOnly = false,
    hint,
  }: {
    label: string;
    value: string;
    onChange?: (text: string) => void;
    readOnly?: boolean;
    hint?: string;
  }) => (
    <View>
      <Text
        allowFontScaling={false}
        style={{
          fontFamily: fontFamily.mono,
          fontSize: 9.5,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: colors.inkMute,
          marginBottom: 6,
          lineHeight: 10,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 14,
          paddingHorizontal: 15,
          borderRadius: radius.tile,
          backgroundColor: readOnly ? colors.sunken : colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
          ...(readOnly ? {} : shadows.shadowSoft),
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          editable={!readOnly}
          placeholderTextColor={colors.inkMute}
          allowFontScaling={false}
          style={{
            flex: 1,
            fontSize: 15.5,
            fontWeight: '600',
            fontFamily: fontFamily.ui,
            color: readOnly ? colors.inkSoft : colors.ink,
            minWidth: 0,
            padding: 0,
          }}
        />
        {hint && (
          <Text
            allowFontScaling={false}
            style={{
              fontSize: 12,
              color: colors.inkMute,
            }}
          >
            {hint}
          </Text>
        )}
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg0 }}>
      <LinearGradient
        colors={gradients.dawn.colors}
        locations={gradients.dawn.locations}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', inset: 0 }}
      />
      <DawnBlobs />

      <TopBar title="edit profile" onBack={handleBack} />

      <ScrollView
        contentContainerStyle={{
          paddingBottom: 140,
          paddingHorizontal: space.gutter,
        }}
        style={{ flex: 1 }}
      >
        {/* Top padding - clear the absolute TopBar (insets.top + 52) */}
        <View style={{ height: insets.top + 64 }} />

        {/* Avatar section */}
        <View
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          {/* Avatar — your initial in your coral. (No photo-picker stub: photos
              aren't a real feature yet, so nothing here pretends they are.) */}
          <Tok
            who={{ initial: (name[0] || 'Y').toUpperCase() }}
            size={88}
            you
            ring
          />
          <Text
            allowFontScaling={false}
            style={{
              marginTop: 10,
              fontSize: 12.5,
              lineHeight: 12.5 * 1.4,
              color: colors.inkMute,
              fontFamily: fontFamily.ui,
            }}
          >
            your initial is your face here, for now
          </Text>
        </View>

        {/* Form fields */}
        <View style={{ flexDirection: 'column', gap: 16 }}>
          <Field label="Your name" value={name} onChange={setName} />
          <Field label="Together since" value={since} onChange={setSince} hint="📅" />

          {/* Paired with read-only card (couples mode only) */}
          {!ONE_SIDE && (
          <View>
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: fontFamily.mono,
                fontSize: 9.5,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
                color: colors.inkMute,
                marginBottom: 6,
                lineHeight: 10,
              }}
            >
              paired with
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                paddingVertical: 12,
                paddingHorizontal: 15,
                borderRadius: radius.tile,
                backgroundColor: colors.sunken,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              {/* Partner avatar */}
              <Tok who={{ initial: (partnerName[0] || 'D').toUpperCase() }} size={32} />

              {/* Partner info */}
              <View style={{ flex: 1 }}>
                <Text
                  allowFontScaling={false}
                  style={{
                    fontSize: 15,
                    fontWeight: '700',
                    color: colors.ink,
                  }}
                >
                  {partnerName}
                </Text>
                <Text
                  allowFontScaling={false}
                  style={{
                    fontSize: 12,
                    lineHeight: 12 * 1.4,
                    color: colors.inkSoft,
                    marginTop: 2,
                  }}
                >
                  {`paired · ${togetherSince || 'Feb 2024'}`}
                </Text>
              </View>

              {/* LINKED badge */}
              <Text
                allowFontScaling={false}
                style={{
                  fontFamily: fontFamily.mono,
                  fontSize: 9,
                  fontWeight: '700',
                  letterSpacing: 0.8,
                  color: colors.matchDeep,
                  backgroundColor: 'rgba(84,194,160,0.16)',
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: radius.pill,
                }}
              >
                LINKED
              </Text>
            </View>
          </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky save button */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: space.gutter,
          paddingVertical: 22,
          zIndex: 40,
          backgroundColor: 'transparent',
        }}
      >
        <LinearGradient
          colors={[colors.bg1, colors.bg1]}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 100,
            opacity: 0.9,
          }}
        />
        <Btn kind="us" onPress={handleSaveChanges} disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Btn>
      </View>

      {toastMsg && <Toast msg={toastMsg} />}
    </View>
  );
}
