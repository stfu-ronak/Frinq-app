import React from 'react';
import { Text, View } from 'react-native';
import { fontFamily } from '../design/tokens/typography';

/**
 * Renders one zero-size, invisible Text per custom font family, mounted at
 * the app root so every Typeface is attached well before any real screen
 * needs it. Android has been observed to briefly mismeasure text on a given
 * custom font's first-ever use in a session (the pill sizes/paints correctly
 * a moment later, once the Typeface is fully attached) — most visible as a
 * multi-word label's second word flashing missing for a single frame right
 * as a screen transitions in. Warming every family here, once, at boot means
 * no screen is ever the "first use" of a given font again.
 */
export function FontWarmup() {
  return (
    <View
      style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Object.values(fontFamily).map((family) => (
        <Text key={family} style={{ fontFamily: family }}>
          Aa
        </Text>
      ))}
    </View>
  );
}
