import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Note } from '../../analysis/types';
import SmallCaps from '../../components/SmallCaps';
import { colors, space } from '../../design/tokens';
import { fontFamily } from '../../design/typography';

const LONG_WHY = 60;

// The other faults the CV saw, under the one headline cue. Nothing when there are none.
export default function CueNotes({ notes }: { notes?: Note[] }) {
  if (!notes?.length) return null;
  return (
    <View testID="cue-notes" style={{ gap: space.s2, paddingTop: space.s2 }}>
      <SmallCaps>Also worth a look</SmallCaps>
      {notes.slice(0, 3).map((n) => (
        <NoteRow key={n.faultId} note={n} />
      ))}
    </View>
  );
}

function NoteRow({ note }: { note: Note }) {
  const [open, setOpen] = useState(false);
  const long = note.why.length > LONG_WHY;
  return (
    <Pressable
      testID={`note-${note.faultId}`}
      disabled={!long}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole={long ? 'button' : undefined}
      accessibilityState={long ? { expanded: open } : undefined}
      style={{ gap: 2 }}
    >
      <Text numberOfLines={1} style={{ color: colors.text, fontFamily: fontFamily.bodyMedium, fontSize: 15, lineHeight: 20 }}>
        {note.text}
      </Text>
      <Text
        testID={`note-why-${note.faultId}`}
        numberOfLines={open ? undefined : 1}
        style={{ color: colors.text2, fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 }}
      >
        {note.why}
      </Text>
    </Pressable>
  );
}
