import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmallCaps from '../../components/SmallCaps';
import TopBar from '../../components/TopBar';
import { colors, control, shape, space, stroke } from '../../design/tokens';
import { type } from '../../design/typography';
import { t } from '../../i18n';
import { NAME_MAX, NOTE_MAX, TAGS_MAX, TAG_MAX, addLiftTag, detailsOf, removeLiftTag, setLiftDetails, tagSuggestions, useLiftDetails } from './liftDetails';

// A TextInput takes the face and size of a type style but no lineHeight: on iOS a lineHeight shifts the caret and the text.
const input: TextStyle = {
  borderWidth: stroke.hairline,
  borderColor: colors.hairline,
  ...shape.control,
  paddingHorizontal: space.s3,
  color: colors.text,
  fontFamily: type.body.fontFamily,
  fontSize: type.body.fontSize,
};

const chip = {
  height: control.chipHeight,
  paddingHorizontal: space.s3,
  flexDirection: 'row',
  alignItems: 'center',
  gap: space.s2,
  borderWidth: stroke.hairline,
  ...shape.control,
} as const;

// The lifter's own name, tags and note for one lift. Every change is saved as it is made, so leaving is the only action.
export default function LiftDetailsScreen({
  id,
  kind,
  title,
  back,
  onBack,
}: {
  id: string;
  // What the app read the lift as (Snatch): shown while the lifter has not named it.
  kind: string | null;
  title: string;
  back: string;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const all = useLiftDetails((s) => s.details);
  const saved = detailsOf(all, id);
  const [name, setName] = useState(saved.name);
  const [note, setNote] = useState(saved.note);
  const [tag, setTag] = useState('');
  const full = saved.tags.length >= TAGS_MAX;
  const suggestions = full ? [] : tagSuggestions(all, id, tag);
  const add = (raw: string) => {
    if (addLiftTag(id, raw) || !raw.trim()) setTag('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      testID="lift-details"
      style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}
    >
      <TopBar back={back} onBack={onBack} title={title} more={false} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        testID="details-scroll"
        contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.s4, paddingBottom: Math.max(insets.bottom, space.s4) + space.s5, gap: space.s5 }}
      >
        <View style={{ gap: space.s2 }}>
          <SmallCaps>{t('library.details.name')}</SmallCaps>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setLiftDetails(id, { name: v.trim() });
            }}
            maxLength={NAME_MAX}
            placeholder={kind ?? t('library.details.namePlaceholder')}
            placeholderTextColor={colors.text3}
            returnKeyType="done"
            accessibilityLabel={t('library.details.name')}
            testID="details-name"
            style={[input, { height: control.height }]}
          />
        </View>

        <View style={{ gap: space.s2 }}>
          <SmallCaps>{t('library.details.tags')}</SmallCaps>
          {saved.tags.length > 0 ? (
            <View testID="details-tags" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
              {saved.tags.map((x) => (
                <Pressable
                  key={x}
                  onPress={() => removeLiftTag(id, x)}
                  accessibilityRole="button"
                  accessibilityLabel={t('library.details.removeTag', { tag: x })}
                  hitSlop={2}
                  testID={`details-tag-${x}`}
                  style={[chip, { borderColor: colors.text }]}
                >
                  <Text style={{ ...type.caption, color: colors.text }}>{x}</Text>
                  <Text style={{ ...type.caption, color: colors.text2 }}>×</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {full ? null : (
            <TextInput
              value={tag}
              onChangeText={setTag}
              onSubmitEditing={() => add(tag)}
              submitBehavior="submit"
              maxLength={TAG_MAX}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('library.details.tagPlaceholder')}
              placeholderTextColor={colors.text3}
              returnKeyType="done"
              accessibilityLabel={t('library.details.tagPlaceholder')}
              testID="details-tag-input"
              style={[input, { height: control.height }]}
            />
          )}
          {suggestions.length > 0 ? (
            <View testID="details-suggestions" style={{ gap: space.s2, paddingTop: space.s1 }}>
              <Text style={{ ...type.small, color: colors.text2 }}>{t('library.details.suggested')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s2 }}>
                {suggestions.map((x) => (
                  <Pressable
                    key={x}
                    onPress={() => add(x)}
                    accessibilityRole="button"
                    accessibilityLabel={t('library.details.addTag', { tag: x })}
                    hitSlop={2}
                    testID={`details-suggest-${x}`}
                    style={[chip, { borderColor: colors.hairline }]}
                  >
                    <Text style={{ ...type.caption, color: colors.text2 }}>{x}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ gap: space.s2 }}>
          <SmallCaps>{t('library.details.note')}</SmallCaps>
          <TextInput
            value={note}
            onChangeText={(v) => {
              setNote(v);
              setLiftDetails(id, { note: v.trim() });
            }}
            multiline
            maxLength={NOTE_MAX}
            placeholder={t('library.details.notePlaceholder')}
            placeholderTextColor={colors.text3}
            accessibilityLabel={t('library.details.note')}
            testID="details-note"
            style={[input, { minHeight: 144, paddingVertical: space.s3, textAlignVertical: 'top' }]}
          />
        </View>

        <Text testID="details-private" style={{ ...type.small, color: colors.text2 }}>
          {t('library.details.private')}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
