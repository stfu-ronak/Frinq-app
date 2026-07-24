/** Spacing scale, radii, touch targets, and elevation. No raw magic numbers
 *  in components — compose these tokens. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** Accessibility: 48 dp preferred minimum touch target (design spec);
 *  44 is the absolute floor for dense secondary controls. */
export const touchTarget = {
  min: 44,
  preferred: 48,
} as const;

export const elevation = {
  none: 0,
  card: 2,
  sheet: 8,
  dialog: 16,
} as const;

export type Spacing = typeof spacing;
