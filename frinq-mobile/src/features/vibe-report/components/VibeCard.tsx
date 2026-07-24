import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { spacing, radius } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { ShareCard } from '../../../services/api/contracts';
import { getArchetypeIllustration, resolveArchetypeSlug } from '../archetypeIllustrations';

type Props = {
  shareCard: ShareCard | null;
  /** Used when share_card is absent/malformed — the archetype name alone is
   *  still worth showing rather than an empty card. */
  fallbackArchetype?: string | null;
  /** 'onscreen' = responsive. 'share' = fixed-size, noninteractive
   *  composition for image capture (react-native-view-shot). */
  mode?: 'onscreen' | 'share';
};

const SHARE_SIZE = 360;

/** The collectible archetype card — rendered once on-screen and once
 *  off-screen (mode="share") for capture. All content comes from the
 *  server's `share_card` JSON; nothing archetype-specific is hardcoded here. */
export function VibeCard({ shareCard, fallbackArchetype, mode = 'onscreen' }: Props) {
  const archetype = shareCard?.archetype ?? fallbackArchetype ?? null;
  const slug = shareCard
    ? resolveArchetypeSlug({ archetype: shareCard.archetype, share_card: shareCard })
    : fallbackArchetype
      ? fallbackArchetype.toLowerCase().replace(/[^a-z]+/g, '-')
      : null;
  const illustration = getArchetypeIllustration(slug);
  const isShare = mode === 'share';

  return (
    <View
      style={[styles.card, isShare && styles.cardShare]}
      accessible={!isShare}
      accessibilityRole={isShare ? undefined : 'summary'}
      accessibilityLabel={archetype ? `Your Frinq archetype: ${archetype}` : undefined}
      importantForAccessibility={isShare ? 'no-hide-descendants' : 'auto'}
    >
      <View style={styles.artWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {illustration ? (
          <Image source={illustration} style={styles.art} resizeMode="contain" />
        ) : (
          <View style={styles.artPlaceholder} />
        )}
      </View>
      {!!archetype && (
        <BrandHeading variant="heading" tone="onMaroon" style={styles.archetype}>
          {archetype}
        </BrandHeading>
      )}
      {!!shareCard?.nickname && (
        <BodyText variant="body" tone="onMaroon" style={styles.nickname}>
          {shareCard.nickname}
        </BodyText>
      )}
      {!!shareCard?.pull_quote && (
        <BodyText variant="subheading" tone="onMaroon" style={styles.quote}>
          &ldquo;{shareCard.pull_quote}&rdquo;
        </BodyText>
      )}
      {!!shareCard?.stats && (
        <View style={styles.statsRow}>
          <Stat label="energy" value={`${shareCard.stats.social_energy}%`} />
          <Stat label="role" value={shareCard.stats.group_role} />
          <Stat label="rarity" value={shareCard.stats.rarity} />
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <BodyText variant="caption" tone="onMaroon" style={styles.statLabel}>
        {label}
      </BodyText>
      <BodyText variant="bodyStrong" tone="onMaroon">
        {value}
      </BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.brand.maroon,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  cardShare: { width: SHARE_SIZE, height: SHARE_SIZE, justifyContent: 'center' },
  artWrap: { marginBottom: spacing.md },
  art: { width: 96, height: 96 },
  artPlaceholder: { width: 96, height: 96, borderRadius: 999, backgroundColor: color.brand.peach, opacity: 0.3 },
  archetype: { textAlign: 'center' },
  nickname: { textAlign: 'center', marginTop: spacing.xxs, opacity: 0.85 },
  quote: { textAlign: 'center', marginTop: spacing.lg },
  statsRow: { flexDirection: 'row', marginTop: spacing.lg, gap: spacing.xl },
  stat: { alignItems: 'center' },
  statLabel: { opacity: 0.7, marginBottom: spacing.xxs },
});
