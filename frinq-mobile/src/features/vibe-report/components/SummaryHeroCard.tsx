import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { color } from '../../../design/tokens/colors';
import { radius, spacing } from '../../../design/tokens/spacing';
import { fontFamily } from '../../../design/tokens/typography';

/** Figma node 518:362 ("Card"): 346.5 x 267.5 — noticeably shorter and wider
 *  than the swipeable deck's own cards (367 x 390 below it), and it never
 *  joins the deck. It sits alone right under the masthead as a static "here's
 *  your type" plaque; only the four quick-read cards beneath "what stands out
 *  about you" are swipeable. */
const HERO_ASPECT = 346.5 / 267.5;

function HeroSheen() {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <RadialGradient id="heroSheen" cx="0.12" cy="0.06" r="0.62">
          <Stop offset="0" stopColor={color.brand.cream} stopOpacity={0.14} />
          <Stop offset="1" stopColor={color.brand.cream} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill="url(#heroSheen)" />
    </Svg>
  );
}

type Props = {
  typeName: string;
  typeDefinition: string;
};

/** The static hero plaque — the reveal's "here is your type" moment. Not
 *  interactive: the envelope already carries the "tap to open" gesture the
 *  Figma's own caption ("tap on the card to open your frinq summary")
 *  describes, so this doesn't need a second one — it renders straight away,
 *  already open. */
export function SummaryHeroCard({ typeName, typeDefinition }: Props) {
  return (
    <View style={styles.frame}>
      <View style={styles.body}>
        <HeroSheen />
        <BrandHeading variant="display" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={styles.title}>
          {typeName}
        </BrandHeading>
        <BodyText numberOfLines={4} style={styles.description}>{typeDefinition}</BodyText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The pale-yellow "frame" is a second box behind the card, not a border on
  // it — react-native's borderWidth clips inward and would eat into the red
  // body's own corner radius; a padded outer box keeps both radii clean.
  frame: {
    width: '100%',
    aspectRatio: HERO_ASPECT,
    padding: 9,
    borderRadius: radius.xl + 4,
    backgroundColor: color.summary.heroFrame,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  body: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: color.summary.sealRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: { fontSize: 27, lineHeight: 34, textAlign: 'center', color: color.brand.cream, letterSpacing: -0.5 },
  description: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    color: color.brand.cream,
  },
});
