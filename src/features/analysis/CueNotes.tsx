import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Note } from '../../analysis/types';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { cueText, cueWhy } from '../../i18n/cues';

const LONG_WHY = 60;

// The other faults the CV saw, under the one headline cue. Nothing when there are none.
export default function CueNotes({ notes }: { notes?: Note[] }) {
  if (!notes?.length) return null;
  return (
    <View testID="cue-notes" style={{ gap: space.s2, paddingTop: space.s2 }}>
      <SmallCaps>{t('analysis.notes.alsoWorthALook')}</SmallCaps>
      {notes.slice(0, 3).map((n) => (
        <NoteRow key={n.faultId} note={n} />
      ))}
    </View>
  );
}


export function Disclaimer() {
  return (
    <Text testID="disclaimer" style={{ ...type.small, color: colors.text2, paddingTop: space.s2 }}>
      {t('analysis.notes.disclaimer')}
    </Text>
  );
}

function NoteRow({ note }: { note: Note }) {
  const [open, setOpen] = useState(false);
  const why = cueWhy(note.faultId, note.why);
  const long = why.length > LONG_WHY;
  return (
    <Pressable
      testID={`note-${note.faultId}`}
      disabled={!long}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole={long ? 'button' : undefined}
      accessibilityState={long ? { expanded: open } : undefined}
      style={{ gap: space.s1 }}
    >
      <Text numberOfLines={1} style={{ ...type.label, color: colors.text }}>
        {cueText(note.faultId, note.text)}
      </Text>
      <Text
        testID={`note-why-${note.faultId}`}
        numberOfLines={open ? undefined : 1}
        style={{ ...type.small, color: colors.text2 }}
      >
        {why}
      </Text>
    </Pressable>
  );
}
