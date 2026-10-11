import { useState } from 'react';
import { Image, Linking, Pressable, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { Analysis } from '../../analysis/types';
import { frameSource } from '../../analysis/frames';
import { keyFrameForPhase, repByIndex } from '../../analysis/timeline';
import Btn from '../../components/Btn';
import Sheet from '../../components/Sheet';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';
import { LINK_DAYS, coachRepository, type CoachLink, type CoachRepository } from './coachRepository';
import { Body, SheetTitle, ToggleRow } from './ui';

export function coachMessage(url: string): string {
  return `Can you check this lift? ${url}`;
}

type Deps = {
  repo: CoachRepository;
  copy: (text: string) => Promise<unknown>;
  open: (url: string) => Promise<unknown>;
  share: (message: string) => Promise<unknown>;
};

const DEFAULT_DEPS: Deps = {
  repo: coachRepository,
  copy: (t) => Clipboard.setStringAsync(t),
  open: (u) => Linking.openURL(u),
  share: (message) => Share.share({ message }),
};

export default function SendToCoachSheet({
  analysis,
  onClose,
  deps = DEFAULT_DEPS,
}: {
  analysis: Analysis;
  onClose: () => void;
  deps?: Deps;
}) {
  const [includeCue, setIncludeCue] = useState(true);
  const [includeRecent, setIncludeRecent] = useState(false);
  const [link, setLink] = useState<CoachLink | null>(null);
  const [copied, setCopied] = useState(false);
  const rep = repByIndex(analysis, analysis.cue?.evidence.rep ?? analysis.bestRepIndex);
  const bg = frameSource((keyFrameForPhase(rep, 'transition') ?? rep.keyFrames[0])?.image);

  const ensureLink = async () => {
    if (link && link.includeCue === includeCue && link.includeRecent === includeRecent) return link;
    const l = await deps.repo.createLink(analysis.id, { includeCue, includeRecent });
    setLink(l);
    return l;
  };

  const copy = async () => {
    const l = await ensureLink();
    await deps.copy(l.url);
    setCopied(true);
  };

  const via = async (kind: 'whatsapp' | 'messages' | 'more') => {
    const l = await ensureLink();
    const text = coachMessage(l.url);
    if (kind === 'more') return deps.share(text);
    const url =
      kind === 'whatsapp' ? `whatsapp://send?text=${encodeURIComponent(text)}` : `sms:&body=${encodeURIComponent(text)}`;
    return deps.open(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} testID="send-to-coach">
      {bg ? <Image source={bg} resizeMode="cover" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, opacity: 0.2 }} /> : null}
      <Pressable style={{ flex: 1 }} onPress={onClose} testID="send-to-coach-scrim" accessibilityLabel="Close" />
      <Sheet gap={16}>
        <SheetTitle>Send to my coach</SheetTitle>
        <Body>
          {`A link to this lift with the overlay, the cue and the numbers. No login for them. Expires in ${LINK_DAYS} days.`}
        </Body>
        <View style={{ borderTopWidth: 1, borderTopColor: colors.hairline }}>
          <ToggleRow label="Include the app's cue" value={includeCue} onChange={setIncludeCue} testID="include-cue" />
          <ToggleRow label="Include my last 3 lifts" value={includeRecent} onChange={setIncludeRecent} testID="include-recent" />
        </View>
        <Btn onPress={copy} testID="copy-link">
          {copied ? 'Link copied' : 'Copy link'}
        </Btn>
        {copied && link ? (
          <Text testID="coach-link-url" style={{ color: colors.text2, fontFamily: fontFamily.mono, fontSize: 13, lineHeight: 18, textAlign: 'center' }}>
            {link.url}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space.s5 }}>
          <Btn kind="text" onPress={() => via('whatsapp')} testID="via-whatsapp">
            WhatsApp
          </Btn>
          <Btn kind="text" onPress={() => via('messages')} testID="via-messages">
            Messages
          </Btn>
          <Btn kind="text" onPress={() => via('more')} testID="via-more">
            More
          </Btn>
        </View>
      </Sheet>
    </View>
  );
}
