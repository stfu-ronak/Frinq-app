import React, { useState } from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { color } from '../../../design/tokens/colors';
import { spacing } from '../../../design/tokens/spacing';
import { fontFamily } from '../../../design/tokens/typography';

/** Real asset (Public/Assets/summary/hero-card.webp, 337x442, ~10KB — scaled
 *  down from an ~800KB/1321x1732 png for load time): a gold-framed maroon
 *  plaque with its own engraved vein pattern baked in — no SVG decoration
 *  layered on top of it, the image already carries that. Text is overlaid
 *  in the frame's inset area, well clear of the gold border. */
const HERO_ASPECT = 337 / 442;

type Props = {
  typeName: string;
  typeDefinition: string;
  /** Exact box width in dp. When omitted (the envelope reveal, which doesn't
   *  know its own box size up front), the card measures its parent via
   *  onLayout instead — see the width fallback below. When given (the report
   *  page), it's used directly: a percentage width on this box previously
   *  resolved against the wrong ancestor through the Animated.View/
   *  negative-margin wrapper chain above it, rendering ~11% wider than
   *  intended — a plain number sidesteps that ambiguity entirely. */
  width?: number;
  /** Reveal mode: show ONLY the type name, centred, and drop the definition.
   *  The envelope reveal is a ~1s beat where a paragraph can't be read
   *  anyway, and a single centred line is unambiguous to lay out. The full
   *  card (name + definition) is what the report page renders. */
  titleOnly?: boolean;
};

/** The static hero plaque — the reveal's "here is your type" moment. Not
 *  interactive: the envelope already carries the "tap to open" gesture the
 *  Figma's own caption ("tap on the card to open your frinq summary")
 *  describes, so this doesn't need a second one — it renders straight away,
 *  already open. */
export function SummaryHeroCard({ typeName, typeDefinition, width: explicitWidth, titleOnly = false }: Props) {
  // Fallback path (envelope only): seeded from the window width rather than
  // 0, since onLayout doesn't fire in the test renderer and gating the
  // card's actual text behind a real measurement hid it there entirely.
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(windowWidth * 0.7);
  const width = explicitWidth ?? measuredWidth;
  const height = width / HERO_ASPECT;
  return (
    <View
      // When the caller told us the width, pin the frame to exactly that
      // instead of '100%'. A percentage width resolving against the wrong
      // ancestor (which happens inside the envelope's Animated.View chain)
      // makes alignItems:'center' centre the card against a box that isn't
      // the real one — shifting the card, and its text, off to one side.
      style={[styles.frame, explicitWidth != null && { width: explicitWidth }]}
      onLayout={explicitWidth == null ? (e) => setMeasuredWidth(e.nativeEvent.layout.width) : undefined}
    >
      <View style={{ width, height }}>
        <Image
          source={require('../../../../Public/Assets/summary/hero-card.webp')}
          // Explicit pixels, NOT StyleSheet.absoluteFill. absoluteFill left
          // the plaque free to resolve against an ancestor rather than this
          // box: it rendered ~1.4x too wide and re-centred on the SCREEN,
          // while the text (correctly laid out at 116 of a 232dp card) stayed
          // put — which is what read as "the text is off to the left". Same
          // explicit-pixel rule the rest of this screen already follows.
          style={{ position: 'absolute', top: 0, left: 0, width, height }}
          resizeMode="stretch"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
        {/* FLEX child, not an absolutely-positioned overlay. The parent has a
            literal width/height, so `flex: 1` fills it exactly with no inset
            resolution involved at all.
            Absolute positioning was the bug: inside the envelope's
            Animated.View + scale chain the box collapsed to its own content
            and anchored at the card's top-left corner instead of filling it,
            so the text centred on roughly (0.38w, 0.40h) — visibly up and to
            the left — while the report page, with no transform above it,
            resolved the same styles correctly and looked fine. Flex layout
            can't drift that way. */}
        <View
          style={[
            styles.content,
            { paddingHorizontal: width * 0.12, paddingVertical: height * 0.1 },
          ]}
        >
          <BrandHeading
            variant="display"
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            // alignSelf stretch + textAlign center: the heading spans the full
            // padded width and centres its glyphs inside that, rather than
            // shrink-wrapping to the text and relying on the parent to place
            // the resulting box. One less thing that can settle off-centre.
            style={{ ...styles.title, ...styles.fullWidth }}
          >
            {typeName}
          </BrandHeading>
          {/* Reveal shows the name alone (see `titleOnly`). On the report page
              the definition follows.
              numberOfLines has to clear what the BOX can hold, not just what
              the current copy contract emits: the content area is 80% of the
              card height, which at a 337:442 card and a 16dp lineHeight is
              ~16 lines once the title is placed. The old cap of 5 was the
              binding constraint, not the geometry, so any legacy report with
              a longer typeDefinition ellipsized against a card that had room
              to spare — adjustsFontSizeToFit only shrinks WITHIN the cap, it
              can never add a line. */}
          {!titleOnly && (
            <BodyText
              numberOfLines={12}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{ ...styles.description, ...styles.fullWidth }}
            >
              {typeDefinition}
            </BodyText>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', alignItems: 'center' },
  // Inset from the image's own gold frame border (~2.5% of width in the
  // source art) plus room so text never sits under the engraved veins.
  // Padding is supplied inline from the card's own width/height (see the call
  // site). absoluteFill guarantees this box matches the card exactly.
  // flex:1 inside the fixed-size card box — fills it exactly, and unlike an
  // absolutely-positioned overlay cannot collapse to its content under a
  // parent transform. Padding comes from the call site.
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Spans the padded content width so textAlign:'center' does the centring,
  // instead of a shrink-wrapped box being positioned by its parent.
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  title: { fontSize: 23, lineHeight: 29, textAlign: 'center', color: color.brand.cream, letterSpacing: -0.5 },
  description: {
    marginTop: spacing.sm,
    fontFamily: fontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: color.brand.cream,
  },
});
