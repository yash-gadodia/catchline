import React, { useState } from 'react';
import { View, ScrollView, Text, TextInput } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { success } from '../../../lib/haptics';
import Btn from '../../../components/Btn';
import Press from '../../../components/Press';
import Card from '../../../components/Card';
import { Serif } from '../../../components/Text';
import { colors, space } from '../../../design/tokens';
import { fontFamily } from '../../../design/typography';
import {
  RefocusReadV2,
  READ_COPY,
  NO_BRIDGE_COPY,
  AI_DISCLOSURE,
  THERAPY_DISCLAIMER,
  SCREENING_UNAVAILABLE_NOTE,
} from '../../../content/refocus';

export interface ReadResultStepProps {
  insets: ReturnType<typeof useSafeAreaInsets>;
  read: RefocusReadV2;
  /** True once the single regenerate has been spent. */
  regenerated: boolean;
  onRegenerate: () => void;
  onCopied: () => void;
  onDone: () => void;
}

function Eyebrow({ children }: { children: string }) {
  return (
    <Text
      allowFontScaling={false}
      style={{
        fontFamily: fontFamily.mono,
        fontSize: 10.5,
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        color: colors.inkSoft,
      }}
    >
      {children}
    </Text>
  );
}

function ReadCard({
  head,
  body,
  rule,
}: {
  head: string;
  body: string;
  rule?: string;
}) {
  return (
    <Card
      style={{
        borderRadius: 22,
        paddingHorizontal: 20,
        paddingVertical: 18,
        marginTop: 16,
        ...(rule ? { borderLeftWidth: 3, borderLeftColor: rule } : {}),
      }}
    >
      <Serif s={20} style={{ lineHeight: 20 * 1.2, marginBottom: 8 }}>
        {head}
      </Serif>
      <Text
        style={{
          fontSize: 16,
          lineHeight: 16 * 1.45,
          color: colors.ink,
          fontFamily: fontFamily.ui,
        }}
      >
        {body}
      </Text>
    </Card>
  );
}

/**
 * ONE SIDE result: the answer before the analysis. The bridge card is
 * accent-free (the sentence is the user's to send, not the AI's to claim);
 * Copy is gated on edit with a visible "Use it as is" escape; Copy records
 * copied ONLY — "sent" is a manual act in Receipts. The no-bridge variant is
 * the stillness preset: no accent, no copy, one button.
 */
export function ReadResultStep({
  insets,
  read,
  regenerated,
  onRegenerate,
  onCopied,
  onDone,
}: ReadResultStepProps) {
  const [msg, setMsg] = useState(read.bridge);
  const [owned, setOwned] = useState(false);
  const [copied, setCopied] = useState(false);
  const edited = msg.trim() !== read.bridge.trim();
  const unlocked = edited || owned;
  const noBridge = read.bridge_decision === 'no_bridge';

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: space.gutter,
          paddingTop: noBridge ? 32 : 20,
          paddingBottom: 24 + insets.bottom,
          flexGrow: 1,
        }}
      >
        {noBridge && read.no_bridge ? (
          <>
            <Eyebrow>{NO_BRIDGE_COPY.eyebrow}</Eyebrow>
            <Serif
              s={30}
              style={{ marginTop: 14, lineHeight: 30 * 1.13, letterSpacing: -0.36 }}
            >
              {NO_BRIDGE_COPY.headline}
            </Serif>
            <Text
              style={{
                fontSize: 16,
                lineHeight: 16 * 1.45,
                color: colors.ink,
                fontFamily: fontFamily.ui,
                marginTop: 10,
              }}
            >
              {read.no_bridge.noticed}
            </Text>
            <ReadCard head={READ_COPY.underneathHead} body={read.underneath} />
            <ReadCard head={READ_COPY.notWrongHead} body={read.not_wrong_about} />
            <Text
              style={{
                fontSize: 17,
                lineHeight: 17 * 1.45,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                textAlign: 'center',
                maxWidth: 300,
                alignSelf: 'center',
                marginTop: 28,
                marginBottom: 'auto' as unknown as number,
              }}
            >
              {`${read.no_bridge.let_go} ${NO_BRIDGE_COPY.nothingToSend}`}
            </Text>
            <View style={{ marginTop: 28 }}>
              <Btn kind="soft" onPress={onDone} testID="read-done">
                {READ_COPY.done}
              </Btn>
            </View>
          </>
        ) : (
          <>
            <Eyebrow>{READ_COPY.eyebrow}</Eyebrow>
            {/* Bridge card: accent-free, serif, editable in place. */}
            <Card
              style={{
                borderRadius: 22,
                paddingHorizontal: 20,
                paddingVertical: 18,
                marginTop: 14,
              }}
            >
              <TextInput
                testID="bridge-input"
                value={msg}
                onChangeText={setMsg}
                multiline
                style={{
                  fontSize: 22,
                  lineHeight: 22 * 1.25,
                  fontFamily: fontFamily.disp,
                  color: colors.ink,
                }}
              />
            </Card>
            <Text
              style={{
                fontSize: 12.5,
                color: colors.inkSoft,
                fontFamily: fontFamily.ui,
                marginTop: 8,
              }}
            >
              {unlocked ? READ_COPY.editedHint : READ_COPY.editHint}
            </Text>

            <View style={{ marginTop: 12 }}>
              <Btn
                kind={unlocked ? 'ink' : 'soft'}
                testID="copy-bridge"
                disabled={!unlocked}
                onPress={async () => {
                  await Clipboard.setStringAsync(msg.trim());
                  success();
                  setCopied(true);
                  onCopied();
                }}
              >
                {copied ? READ_COPY.copied : READ_COPY.copy}
              </Btn>
              {!unlocked && (
                <Press onPress={() => setOwned(true)} scale={false}>
                  <Text
                    testID="use-as-is"
                    style={{
                      fontSize: 15,
                      fontWeight: '500',
                      color: colors.inkSoft,
                      fontFamily: fontFamily.ui,
                      textAlign: 'center',
                      paddingVertical: 14,
                    }}
                  >
                    {READ_COPY.useAsIs}
                  </Text>
                </Press>
              )}
            </View>

            <ReadCard
              head={READ_COPY.underneathHead}
              body={read.underneath}
              rule={colors.p1}
            />
            <ReadCard
              head={READ_COPY.notWrongHead}
              body={read.not_wrong_about}
              rule={colors.p2}
            />

            {!regenerated && (
              <Press onPress={onRegenerate} scale={false}>
                <Text
                  testID="read-regenerate"
                  style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: colors.inkSoft,
                    fontFamily: fontFamily.ui,
                    paddingVertical: 12,
                    marginTop: 4,
                  }}
                >
                  {READ_COPY.regenerate}
                </Text>
              </Press>
            )}

            <View style={{ marginTop: 'auto' as unknown as number, paddingTop: 20 }}>
              <Btn kind="soft" onPress={onDone} testID="read-done">
                {READ_COPY.done}
              </Btn>
            </View>
          </>
        )}

        {read.screening_unavailable && (
          <Text
            style={{
              textAlign: 'center',
              fontSize: 11.5,
              color: colors.inkSoft,
              marginTop: 18,
              lineHeight: 11.5 * 1.5,
              fontFamily: fontFamily.ui,
            }}
          >
            {SCREENING_UNAVAILABLE_NOTE}
          </Text>
        )}
        <Text
          style={{
            textAlign: 'center',
            fontSize: 11.5,
            color: colors.inkMute,
            marginTop: read.screening_unavailable ? 8 : 18,
            lineHeight: 11.5 * 1.5,
            fontFamily: fontFamily.ui,
          }}
        >
          {AI_DISCLOSURE} {THERAPY_DISCLAIMER}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
