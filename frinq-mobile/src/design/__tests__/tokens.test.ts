import { palette, color } from '../tokens/colors';
import { spacing, radius, touchTarget } from '../tokens/spacing';
import { typeScale, fontFamily } from '../tokens/typography';
import { motion, duration } from '../tokens/motion';

describe('color tokens', () => {
  it('pins the exact approved brand palette', () => {
    expect(palette.maroon).toBe('#621507');
    expect(palette.cream).toBe('#FFFBF7');
    expect(palette.peach).toBe('#FFE8D6');
    expect(palette.brown).toBe('#3C2110');
  });

  it('maps semantic roles onto the brand palette', () => {
    expect(color.bg.canvas).toBe(palette.cream);
    expect(color.bg.milestone).toBe(palette.maroon);
    expect(color.text.primary).toBe(palette.brown);
    expect(color.text.onMaroon).toBe(palette.cream);
    expect(color.control.primaryBg).toBe(palette.maroon);
  });
});

describe('spacing/radius/touch tokens', () => {
  it('exposes a monotonic spacing scale', () => {
    const vals = [spacing.xxs, spacing.xs, spacing.sm, spacing.md, spacing.lg, spacing.xl, spacing.xxl, spacing.xxxl];
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });

  it('sets an accessible touch target (>=44, preferred 48) and a pill radius', () => {
    expect(touchTarget.min).toBeGreaterThanOrEqual(44);
    expect(touchTarget.preferred).toBe(48);
    expect(radius.pill).toBeGreaterThanOrEqual(999);
  });
});

describe('typography tokens', () => {
  it('uses Borel for display and Vastago for body/UI', () => {
    expect(typeScale.display.fontFamily).toBe('Borel-Regular');
    expect(typeScale.display.lineHeight).toBe(58);
    expect(typeScale.body.fontFamily).toBe(fontFamily.body);
    expect(fontFamily.body).toMatch(/^VastagoGrotesk-/);
  });

  it('keeps generous line heights for font scaling', () => {
    for (const role of Object.values(typeScale)) {
      expect(role.lineHeight).toBeGreaterThanOrEqual(role.fontSize);
    }
  });
});

describe('motion tokens', () => {
  it('provides enter/select/milestone/reduced recipes', () => {
    expect(motion.enter).toBeDefined();
    expect(motion.select).toBeDefined();
    expect(motion.milestone).toBeDefined();
    expect(motion.reduced).toBeDefined();
  });

  it('reduced-motion removes spatial/scale/loop motion (immediate, no translate/scale)', () => {
    expect(motion.reduced.duration).toBe(duration.instant);
    expect(motion.reduced.translateY).toBe(0);
    expect(motion.reduced.pressScale).toBe(1);
    expect(motion.reduced.staggerStep).toBe(0);
  });
});
