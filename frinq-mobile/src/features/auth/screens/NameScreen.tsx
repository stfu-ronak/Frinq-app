import React, { useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { color } from '../../../design/tokens/colors';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { savePendingQuizState } from '../../quiz/pendingQuizState';

/** Reference 7 live name collection. */
export function NameScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');
  const canContinue = name.trim().length > 0;

  async function handleContinue() {
    if (!canContinue) return;
    await savePendingQuizState({ name: name.trim() });
    navigation.navigate('Phone');
  }

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()} scroll>
      <View style={styles.body}>
        <BrandHeading style={styles.heading}>what should we call you?</BrandHeading>
        <TextInput
          accessibilityLabel="Your name"
          placeholder="your name"
          placeholderTextColor={color.text.muted}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoFocus
          returnKeyType="next"
          onSubmitEditing={handleContinue}
          style={styles.input}
        />
        <PressableScale accessibilityRole="button" accessibilityLabel="Continue with name" accessibilityState={{ disabled: !canContinue }} disabled={!canContinue} onPress={handleContinue} style={[styles.arrow, !canContinue && styles.arrowDisabled]}>
          <Image source={require('../../../../Public/Assets/Red arrow.png')} style={styles.arrowImage} resizeMode="contain" />
        </PressableScale>
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 150, paddingBottom: spacing.xl },
  heading: { textAlign: 'center', fontSize: 42, lineHeight: 55, maxWidth: 340 },
  input: { width: '100%', minHeight: touchTarget.preferred, borderBottomWidth: 1, borderBottomColor: color.border.subtle, marginTop: spacing.xxxl, fontFamily: 'VastagoGrotesk-Regular', fontSize: 26, lineHeight: 34, color: color.text.primary, textAlign: 'center' },
  arrow: { marginTop: 'auto', minHeight: touchTarget.preferred + 8, justifyContent: 'center', alignItems: 'center' },
  arrowImage: { width: 220, height: 62 },
  arrowDisabled: { opacity: 0.4 },
});
