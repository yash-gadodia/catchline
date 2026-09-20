import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import Btn from '../../../components/Btn';
import Press from '../../../components/Press';
import { Serif } from '../../../components/Text';
import { colors, space } from '../../../design/tokens';
import { fontFamily } from '../../../design/typography';
import { CAPTURE_COPY, STEMS } from '../../../content/refocus';
import { parseChatPaste, chatToText, ChatLine } from '../../../domain/chatPaste';
import { loadDraft } from '../receipts';
import { transcribeScreenshot } from '../refocusActions';

export interface CaptureStepProps {
  insets: ReturnType<typeof useSafeAreaInsets>;
  /** Submit the account (and the pasted chat, when one is attached). */
  onRead: (text: string, pastedChat: string | null) => void;
  onOpenReceipts: () => void;
  onOpenSettings: () => void;
}

/**
 * ONE SIDE capture — the launch surface. No onboarding, no tour: a serif
 * question, a prose-primary box (keyboard up on arrival), sentence stems, a
 * Speak affordance that leans on keyboard dictation, and one action: Read it.
 * The raw entry is restored from the draft store, so a crash or failed read
 * never loses what was written (Working/Retry is built first, PRD §10).
 */
export function CaptureStep({
  insets,
  onRead,
  onOpenReceipts,
  onOpenSettings,
}: CaptureStepProps) {
  const [text, setText] = useState('');
  const [chat, setChat] = useState<ChatLine[] | null>(null);
  const [speakHint, setSpeakHint] = useState(false);
  const [pasteMiss, setPasteMiss] = useState(false);
  const [shot, setShot] = useState<'idle' | 'reading' | 'miss'>('idle');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    // Restore an unfinished draft (the Retry guarantee), then raise the
    // keyboard — the keyboard slide is the launch animation.
    loadDraft().then((draft) => {
      if (draft) setText(draft);
    });
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, []);

  const has = text.trim().length > 0 || !!chat;

  const appendStem = (stem: string) => {
    setText((t) => {
      const trimmed = t.replace(/\s+$/, '');
      return trimmed ? `${trimmed}\n${stem}` : stem;
    });
    inputRef.current?.focus();
  };

  const pasteChat = async () => {
    const raw = (await Clipboard.getStringAsync()) ?? '';
    const parsed = parseChatPaste(raw);
    if (parsed) {
      setChat(parsed);
      setPasteMiss(false);
    } else if (raw.trim()) {
      // Not chat-shaped: it is still their words — into the box, not lost.
      setText((t) => (t.trim() ? `${t.trim()}\n${raw.trim()}` : raw.trim()));
      setPasteMiss(true);
    }
  };

  const addScreenshot = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
    });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset?.base64) return;
    setShot('reading');
    const lines = await transcribeScreenshot(
      asset.base64,
      asset.mimeType ?? 'image/jpeg'
    );
    if (lines && lines.length) {
      setChat(lines);
      setShot('idle');
    } else {
      setShot('miss');
    }
  };

  const speak = () => {
    // Keyboard-dictation first (owner decision 1): the pill focuses the input
    // and points at the keyboard's own mic. The native recognizer ships later.
    inputRef.current?.focus();
    setSpeakHint(true);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView
        testID="capture-keyboard-avoider"
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, paddingHorizontal: space.gutter, paddingTop: 8 }}>
          {/* Brand row — the only chrome. Receipts is a quiet word, not a tab. */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Serif s={20} c={colors.inkSoft}>
              Parallax
            </Serif>
            <View style={{ flexDirection: 'row' }}>
              {[
                { label: 'receipts', onPress: onOpenReceipts, id: 'open-receipts' },
                { label: 'settings', onPress: onOpenSettings, id: 'open-settings' },
              ].map((item) => (
                <Press key={item.id} onPress={item.onPress} scale={false}>
                  <Text
                    testID={item.id}
                    allowFontScaling={false}
                    style={{
                      fontFamily: fontFamily.mono,
                      fontSize: 10,
                      letterSpacing: 1.4,
                      textTransform: 'uppercase',
                      color: colors.inkMute,
                      paddingVertical: 12,
                      paddingLeft: 16,
                    }}
                  >
                    {item.label}
                  </Text>
                </Press>
              ))}
            </View>
          </View>

          <Serif
            s={has ? 26 : 34}
            style={{
              marginTop: 8,
              lineHeight: (has ? 26 : 34) * 1.12,
              letterSpacing: -0.012 * (has ? 26 : 34),
            }}
          >
            {CAPTURE_COPY.question}
          </Serif>
          {!has && (
            <Text
              allowFontScaling={false}
              style={{
                fontSize: 15,
                lineHeight: 15 * 1.4,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                marginTop: 6,
              }}
            >
              {CAPTURE_COPY.firstLine}
            </Text>
          )}

          <TextInput
            ref={inputRef}
            testID="capture-input"
            value={text}
            onChangeText={setText}
            multiline
            placeholder={CAPTURE_COPY.placeholder}
            placeholderTextColor={colors.inkMute}
            selectionColor={colors.p1Deep}
            style={{
              flex: 1,
              marginTop: 10,
              fontSize: 17,
              lineHeight: 17 * 1.45,
              fontFamily: fontFamily.ui,
              color: colors.ink,
              textAlignVertical: 'top',
            }}
          />

          {/* Attached chat: quoted evidence inside the account, removable. */}
          {chat && (
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.line,
                borderLeftWidth: 3,
                borderLeftColor: colors.p2,
                borderRadius: 14,
                backgroundColor: colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 10,
                marginBottom: 8,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={{
                    fontFamily: fontFamily.mono,
                    fontSize: 9.5,
                    letterSpacing: 1.1,
                    textTransform: 'uppercase',
                    color: colors.inkMute,
                  }}
                >
                  from your chat
                </Text>
                <Press onPress={() => setChat(null)} scale={false}>
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: 13,
                      color: colors.inkSoft,
                      fontFamily: fontFamily.ui,
                    }}
                  >
                    Remove
                  </Text>
                </Press>
              </View>
              {chat.slice(0, 4).map((l, i) => (
                <Text
                  key={i}
                  numberOfLines={1}
                  style={{
                    fontSize: 14,
                    lineHeight: 14 * 1.45,
                    color: colors.ink,
                    fontFamily: fontFamily.ui,
                  }}
                >
                  <Text style={{ color: colors.p2Deep, fontWeight: '600' }}>
                    {l.who}
                  </Text>
                  {` — ${l.text}`}
                </Text>
              ))}
              {chat.length > 4 && (
                <Text
                  style={{
                    fontSize: 12.5,
                    color: colors.inkSoft,
                    fontFamily: fontFamily.ui,
                    marginTop: 2,
                  }}
                >
                  {`and ${chat.length - 4} more`}
                </Text>
              )}
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 12 * 1.4,
                  color: colors.inkSoft,
                  fontFamily: fontFamily.ui,
                  marginTop: 8,
                }}
              >
                {CAPTURE_COPY.chatConsent}
              </Text>
            </View>
          )}

          {speakHint && (
            <Text
              testID="speak-hint"
              style={{
                fontSize: 13,
                lineHeight: 13 * 1.4,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              Tap the mic on your keyboard and just talk. Fragments are fine.
            </Text>
          )}
          {shot !== 'idle' && (
            <Text
              testID="screenshot-status"
              style={{
                fontSize: 12.5,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {shot === 'reading'
                ? CAPTURE_COPY.readingScreenshot
                : CAPTURE_COPY.screenshotMiss}
            </Text>
          )}
          {pasteMiss && (
            <Text
              style={{
                fontSize: 12.5,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              That didn&apos;t look like a chat, so it went into your words instead.
            </Text>
          )}

          {/* Speak — the hero until words exist, then it steps aside. */}
          {!has && (
            <Btn kind="coral" onPress={speak} testID="capture-speak">
              Speak
            </Btn>
          )}

          {has && (
            <View style={{ marginTop: 10 }}>
              <Btn
                kind="ink"
                testID="capture-read"
                onPress={() => onRead(text, chat ? chatToText(chat) : null)}
              >
                {CAPTURE_COPY.readIt}
              </Btn>
            </View>
          )}

          {/* Sentence stems: a starter for the blank page only. Once words
              exist they have done their job, so they leave. */}
          {!has && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={{ flexGrow: 0, marginTop: 10 }}
            contentContainerStyle={{ gap: 8, paddingBottom: 10 + (has ? 0 : 0) }}
          >
            {STEMS.map((stem) => (
              <Press key={stem} onPress={() => appendStem(stem)} scale={false}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 11,
                  }}
                >
                  <Text
                    allowFontScaling={false}
                    style={{
                      fontSize: 14,
                      color: colors.ink,
                      fontFamily: fontFamily.ui,
                      fontWeight: '500',
                    }}
                  >
                    {`${stem.trim()}…`}
                  </Text>
                </View>
              </Press>
            ))}
            <Press onPress={pasteChat} scale={false}>
              <View
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: 'rgba(112,100,230,0.5)',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={{
                    fontSize: 14,
                    color: colors.p2Deep,
                    fontFamily: fontFamily.ui,
                    fontWeight: '600',
                  }}
                >
                  {CAPTURE_COPY.pasteChat}
                </Text>
              </View>
            </Press>
            <Press onPress={addScreenshot} scale={false}>
              <View
                testID="capture-screenshot"
                style={{
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: 'rgba(112,100,230,0.5)',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                }}
              >
                <Text
                  allowFontScaling={false}
                  style={{
                    fontSize: 14,
                    color: colors.p2Deep,
                    fontFamily: fontFamily.ui,
                    fontWeight: '600',
                  }}
                >
                  {CAPTURE_COPY.addScreenshot}
                </Text>
              </View>
            </Press>
          </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
