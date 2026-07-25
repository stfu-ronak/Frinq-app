import { contrastRatio } from '../contrastRatio';
import { color, palette } from '../tokens/colors';

const AA_NORMAL_TEXT = 4.5;
const AA_LARGE_TEXT_OR_UI = 3.0;

// Real text/background pairs the app actually renders, per tokens/colors.ts's
// own semantic groupings (BodyText/BrandHeading `tone` props, button/switch
// primitives). Verifies the ratios the file's comments already promise.
describe('WCAG AA contrast — real text/background pairs', () => {
  it.each([
    ['text.primary on bg.canvas (body text)', color.text.primary, color.bg.canvas, AA_NORMAL_TEXT],
    ['text.primary on bg.surface (text on peach cards)', color.text.primary, color.bg.surface, AA_NORMAL_TEXT],
    ['text.secondary on bg.canvas (captions)', color.text.secondary, color.bg.canvas, AA_NORMAL_TEXT],
    ['text.secondary on bg.surface (captions on peach)', color.text.secondary, color.bg.surface, AA_NORMAL_TEXT],
    ['text.onMaroon on bg.milestone (full-screen milestone text)', color.text.onMaroon, color.bg.milestone, AA_NORMAL_TEXT],
    ['control.primaryText on control.primaryBg (filled button label)', color.control.primaryText, color.control.primaryBg, AA_NORMAL_TEXT],
    ['control.secondaryText on control.secondaryBg (secondary button label)', color.control.secondaryText, color.control.secondaryBg, AA_NORMAL_TEXT],
    ['text.error on bg.canvas (inline error text)', color.text.error, color.bg.canvas, AA_NORMAL_TEXT],
    ['border.focus on bg.canvas (visible focus ring, non-text UI)', color.border.focus, color.bg.canvas, AA_LARGE_TEXT_OR_UI],
  ])('%s meets its threshold', (_label, fg, bg, threshold) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(threshold);
  });

  // Disabled/inactive text is exempt from WCAG 1.4.3 entirely — still held to
  // a lower non-text floor as a UX baseline, not a spec requirement.
  it('text.disabled on bg.canvas clears the non-text floor (WCAG-exempt, UX baseline only)', () => {
    expect(contrastRatio(color.text.disabled, color.bg.canvas)).toBeGreaterThanOrEqual(AA_LARGE_TEXT_OR_UI);
  });
});

describe('contrastRatio()', () => {
  it('is 21:1 for pure black on pure white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio(palette.maroon, palette.maroon)).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio(palette.maroon, palette.cream)).toBeCloseTo(contrastRatio(palette.cream, palette.maroon), 10);
  });
});
