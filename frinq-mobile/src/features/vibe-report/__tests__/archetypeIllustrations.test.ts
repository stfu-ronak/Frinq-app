import { ARCHETYPE_SLUGS, getArchetypeIllustration, resolveArchetypeSlug } from '../archetypeIllustrations';

describe('archetypeIllustrations', () => {
  it('has exactly the 24 canonical archetype slugs, no duplicates', () => {
    expect(ARCHETYPE_SLUGS).toHaveLength(24);
    expect(new Set(ARCHETYPE_SLUGS).size).toBe(24);
  });

  it.each(ARCHETYPE_SLUGS)('resolves a fallback for every archetype slug without throwing: %s', (slug) => {
    expect(() => getArchetypeIllustration(slug)).not.toThrow();
    // No real assets curated yet — every slug falls back to null (VibeCard's placeholder).
    expect(getArchetypeIllustration(slug)).toBeNull();
  });

  it('returns null for an unknown/empty slug', () => {
    expect(getArchetypeIllustration(null)).toBeNull();
    expect(getArchetypeIllustration('not-a-real-archetype')).toBeNull();
  });

  it('prefers share_card.archetype_slug when present', () => {
    const slug = resolveArchetypeSlug({ archetype: 'Wild Card', share_card: { archetype_slug: 'wild-card' } as any });
    expect(slug).toBe('wild-card');
  });

  it('derives a slug from the archetype name when share_card is absent', () => {
    expect(resolveArchetypeSlug({ archetype: 'Soft Anchor', share_card: null })).toBe('soft-anchor');
    expect(resolveArchetypeSlug({ archetype: "Late-Night Mind", share_card: null })).toBe('late-night-mind');
  });

  it('returns null when there is no archetype at all', () => {
    expect(resolveArchetypeSlug({ archetype: null, share_card: null })).toBeNull();
  });
});
