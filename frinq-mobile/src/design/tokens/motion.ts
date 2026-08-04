/**
 * Motion recipes as plain data (no Reanimated import here so tokens stay pure
 * and testable). The motion helpers in src/design/motion/ consume these.
 *
 * Contract (design spec): quiz choices press+select+haptic; screens may
 * stagger-enter; milestones may animate; reduced-motion replaces spatial/
 * looping motion with a crossfade or immediate state and NEVER loses info.
 */
export const duration = {
  instant: 0,
  fast: 120,
  base: 240,
  enter: 280,
  milestone: 480,
} as const;

/** Cubic-bezier control points (x1,y1,x2,y2). */
export const easing = {
  standard: [0.2, 0, 0, 1],
  decelerate: [0, 0, 0, 1],
  springy: [0.34, 1.56, 0.64, 1],
} as const;

export const motion = {
  enter: { duration: duration.enter, easing: easing.decelerate, translateY: 8, staggerStep: 60 },
  select: { duration: duration.fast, easing: easing.standard, pressScale: 0.96 },
  milestone: { duration: duration.milestone, easing: easing.springy },
  progress: { duration: duration.base, easing: easing.standard },
  // Applied when the OS reduce-motion setting is on: no translate/scale/loop,
  // just an immediate or crossfade state change.
  reduced: { duration: duration.instant, easing: easing.standard, translateY: 0, pressScale: 1, staggerStep: 0 },
} as const;

/** Landing splash entrance (Figma node 163:247): logo scales/fades in first,
 *  tagline fades in alongside it, arrow pill fades in last once the logo has
 *  settled. Timings are the source design's keyframe percentages of its 2s
 *  timeline, converted to ms. */
export const splashIntro = {
  logoOpacity: { duration: 870, easing: [0.5, 0, 0.5, 1] as const },
  logoScale: { duration: 500, easing: easing.decelerate, startScale: 1.2 },
  tagline: { delay: 150, duration: 750, easing: easing.decelerate },
  arrow: { delay: 870, duration: 500, easing: easing.decelerate },
} as const;

export type MotionRecipe = keyof typeof motion;
