# Mobile app icon, launch transition, and heading safety

## Goal

Use the supplied `frinq-mobile/Public/App_icon.png` as Frinq's Android launcher and launch identity. Preserve the device status bar during onboarding, add a restrained launch transition, and prevent Borel display text from clipping at the top on Android.

## Scope

- Generate Android adaptive and legacy launcher icon resources from the supplied image at the required density sizes.
- Replace the native launch-screen mark and the JavaScript boot splash mark with the same Frinq icon treatment.
- Make the JavaScript launch splash fade and slightly scale out once boot resolution completes. The first rendered app screen stays responsive and no artificial delay is introduced.
- Add a single shared Borel heading safety style: Android font padding remains enabled and display headings receive sufficient line-height/vertical breathing room. Existing individual screen sizes continue to work, but glyph ascenders must never be clipped.
- Keep the operating system status bar visible. No React Native screen draws mock time, Wi-Fi, cellular, or battery indicators.

## Non-goals

- No change to the quiz content, auth flow order, or backend behavior.
- No custom fake status bar.
- No animation dependency or long startup animation.

## Verification

- Unit tests cover shared heading safety and splash animation completion.
- Typecheck, lint, mobile test suite, Android debug build, install, and emulator visual inspection pass.
