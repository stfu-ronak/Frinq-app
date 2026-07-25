import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { typeScale } from '../../../design/tokens/typography';
import { PressableScale } from '../../../design/motion/PressableScale';
import { BodyText } from '../../../design/components/Text';

const MAX_BODY_LENGTH = 1000;

type Props = {
  onSend: (body: string) => void;
  disabled: boolean;
  disabledReason?: string;
};

/** Plain text only, native keyboard-safe placement, disabled while offline/
 *  reconnecting/terminal. */
export function MessageComposer({ onSend, disabled, disabledReason }: Props) {
  const [value, setValue] = useState('');

  function submit() {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body);
    setValue('');
  }

  const canSend = !disabled && value.trim().length > 0;

  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={disabled ? disabledReason ?? 'reconnecting…' : 'message your community'}
        placeholderTextColor={color.text.disabled}
        editable={!disabled}
        multiline
        maxLength={MAX_BODY_LENGTH}
        accessibilityLabel="message"
        style={[styles.input, typeScale.body]}
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="send message"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={submit}
        haptic={canSend}
        style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
      >
        <BodyText variant="bodyStrong" style={{ color: color.control.primaryText }}>→</BodyText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: color.border.subtle },
  input: {
    flex: 1,
    minHeight: touchTarget.preferred,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: color.border.subtle,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: color.text.primary,
  },
  sendButton: {
    minWidth: touchTarget.preferred,
    minHeight: touchTarget.preferred,
    borderRadius: radius.pill,
    backgroundColor: color.control.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { backgroundColor: color.control.disabledBg },
});
