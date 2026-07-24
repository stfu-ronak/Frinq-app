import { VibeReport } from '../../services/api/contracts';

/** The 24 canonical archetypes actually enforced at generation time
 *  (frinq-backend/app/core/ai/insights.py's `ARCHETYPES` frozenset, checked
 *  by `_validate()` — NOT app/core/ai/archetypes.py's taxonomy dict, which is
 *  a separate, non-authoritative list that disagrees with this one on one
 *  entry ("Quiet Anchor" vs. the real "Glass House"). Used only to key the
 *  illustration lookup below and for test fixture coverage — descriptive
 *  text always comes from the live report, never duplicated here. */
export const ARCHETYPE_SLUGS = [
  'quiet-storm', 'soft-anchor', 'velvet-rebel', 'curious-outsider',
  'late-night-mind', 'slow-burn', 'backup-plan', 'open-window', 'steady-flame',
  'wild-card', 'soft-skeptic', 'bridge-person', 'inside-voice', 'sharp-empath',
  'patient-witness', 'quiet-rioter', 'wandering-compass', 'tender-realist', 'long-fuse',
  'salt-air', 'pocket-universe', 'open-hand', 'glass-house', 'hidden-door',
] as const;

/** Real per-archetype illustrations aren't curated yet (deferred, tracked
 *  separately — see project memory). Empty today: every archetype falls
 *  back to VibeCard's generic placeholder until real assets are added here,
 *  one `require()` per slug — same mechanism the web reference uses
 *  (`/illustrations/archetypes/{slug}.png`), just Metro's static-require
 *  equivalent instead of a URL. */
const ILLUSTRATIONS: Partial<Record<string, number>> = {};

/** Mirrors the web's slug derivation exactly (vibe-box/page.tsx):
 *  share_card.archetype_slug wins when present, else lowercase-and-hyphenate
 *  the archetype name. */
export function resolveArchetypeSlug(report: Pick<VibeReport, 'archetype' | 'share_card'>): string | null {
  if (report.share_card?.archetype_slug) return report.share_card.archetype_slug;
  if (!report.archetype) return null;
  return report.archetype.toLowerCase().replace(/[^a-z]+/g, '-');
}

/** Returns a require()'d image source, or null if this archetype has no
 *  curated illustration yet (the common case right now). */
export function getArchetypeIllustration(slug: string | null): number | null {
  if (!slug) return null;
  return ILLUSTRATIONS[slug] ?? null;
}
