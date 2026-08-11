import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
import { typeScale } from '../tokens/typography';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  /** Used for accessibility and as the ghost placeholder text shown inside
   *  the line when nothing's been entered yet — there's no separate visible
   *  label above the field. */
  label: string;
  /** Already-committed entries, rendered as removable chips inline with the
   *  cursor — on the same single line, not wrapped underneath it. Overflow
   *  scrolls horizontally instead of wrapping to a second line/growing the
   *  field taller. */
  entries: string[];
  onRemoveEntry: (entry: string) => void;
  /** The in-progress, not-yet-committed word/phrase. */
  value: string;
  onChangeText: (text: string) => void;
  /** Enter commits `value` as a new entry (same shape as picking a listed
   *  option) and the field clears for the next one. */
  onSubmit: () => void;
  placeholder?: string;
  style?: ViewStyle;
};

/** A single underline (not a boxed multi-line area) that holds committed
 *  entries as inline chips alongside the cursor. Long content scrolls
 *  sideways within the one line rather than wrapping and growing taller —
 *  the ghost placeholder only shows while the line is genuinely empty. */
export function TagInputField({ label, entries, onRemoveEntry, value, onChangeText, onSubmit, placeholder, style }: Props) {
  const [focused, setFocused] = useState(false);
  const showPlaceholder = entries.length === 0 && !value;

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={[styles.line, { borderBottomColor: focused ? color.border.focus : color.border.subtle }]}
        contentContainerStyle={styles.row}
      >
        {entries.map((entry) => (
          <PressableScale
            key={entry}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${entry}`}
            onPress={() => onRemoveEntry(entry)}
            style={styles.tag}
          >
            <BodyText style={styles.tagText}>{entry}</BodyText>
          </PressableScale>
        ))}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          blurOnSubmit={false}
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label}
          placeholder={showPlaceholder ? (placeholder || label) : undefined}
          placeholderTextColor={color.text.disabled}
          style={styles.input}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  line: { borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: touchTarget.min, paddingVertical: spacing.xxs },
  tag: {
    backgroundColor: color.state.selected,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Same size as the input text (typeScale.body) — a chip reads as "this is
  // one of your answers", not a caption/footnote, so it shouldn't be smaller.
  tagText: { color: color.text.onMaroon, ...typeScale.body, lineHeight: 22 },
  input: {
    minWidth: 120,
    textAlignVertical: 'center',
    color: color.text.primary,
    ...typeScale.body,
    lineHeight: 22,
  },
});
