# Reference Onboarding UI Design

## Scope

Refresh the already-wired, post-OTP onboarding sequence in `frinq-mobile` to match the supplied Figma frames. The sequence remains `welcome`, `gender`, `pronoun`, `city`, `age`, and `social_verification`; no new navigation routes or backend endpoints are introduced.

## Visual and interaction design

- Welcome uses the maroon reference background, personalised saved name, supplied dudes art, and cream outlined arrow control.
- Gender uses the cream background, decorative ellipse treatment, four Figma-sized choice pills, and an outlined maroon arrow enabled after selection.
- Pronoun uses the same cream treatment, the corrected title `your pronouns`, an underline field, outlined arrow, and a skip action.
- City, birthday, and social verification use the corresponding reference layouts, input spacing, copy, arrow control, and skip actions where the Figma shows one.
- Existing back behaviour, accessibility labels, answer keys, partial-save logic, and optional skip values remain unchanged.

## Architecture and data flow

`ReferenceOnboardingTemplate` stays the single renderer for these fixed onboarding step IDs. It receives quiz state and emits answers through its existing `onAnswer`/`onContinue` callbacks, so `QuizStepScreen` continues to persist answers through the established quiz draft and API flow. Styling is kept local to this template and reuses existing design tokens, `ReferenceJourneyFrame`, text components, and supplied image assets.

## Testing

- Extend the template tests before implementation to cover the corrected pronouns heading, Figma-sized choice controls, and the visual primitives required by each onboarding step.
- Run the focused template and quiz-definition suites after each red/green change.
- Run TypeScript checking and the relevant React Native test suite once the UI work is complete.

## Explicit decisions

- The displayed copy is `your pronouns`, correcting the Figma typo at the user's request.
- The app remains server-authoritative after OTP; this is a visual update to the existing authenticated quiz flow, not a second onboarding state machine.
