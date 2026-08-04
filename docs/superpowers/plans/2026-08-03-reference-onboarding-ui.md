# Reference Onboarding UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the fixed post-OTP onboarding pages match their supplied Figma frames while preserving their existing quiz answer flow.

**Architecture:** Keep `ReferenceOnboardingTemplate` as the renderer for the existing `welcome`, `gender`, `pronoun`, `city`, `age`, and `social_verification` quiz IDs. Replace its approximate spacing and controls with reusable local visual primitives that consume the existing tokens and exported assets. All interaction continues through `onAnswer`, `onContinue`, and `onBack`.

**Tech Stack:** React Native, TypeScript, React Native Testing Library, existing Frinq design tokens and image assets.

## Global Constraints

- The pronoun heading must read exactly `your pronouns`.
- Do not create routes, backend endpoints, or a second onboarding state machine.
- Use Figma-exported assets when an existing local asset does not faithfully match the frame.
- Preserve accessibility labels, quiz answer keys, skip behavior, and back navigation.

---

### Task 1: Lock the reference onboarding contract with tests

**Files:**
- Modify: `frinq-mobile/src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`
- Modify: `frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx`

**Interfaces:**
- Consumes: `ReferenceOnboardingTemplate` props (`step`, `value`, `answers`, `onAnswer`, `onContinue`, `onBack`).
- Produces: tests for copy, controls, and skip behavior used by the visual implementation.

- [ ] **Step 1: Write the failing tests**

Add assertions that gender renders Figma-width choice pills, pronoun renders the text `your pronouns`, and the welcome page includes the exported welcome art and continue control.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`

Expected: FAIL because the current heading is `your pronounce` and the current choice geometry differs from the Figma contract.

- [ ] **Step 3: Implement the minimal visual primitives**

Update the template's heading, choice, input, decorative-background, and arrow styles while retaining its props and callbacks.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`

Expected: PASS.

### Task 2: Apply the Figma geometry to the six post-OTP screens

**Files:**
- Modify: `frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx`
- Test: `frinq-mobile/src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`

**Interfaces:**
- Consumes: the visual primitives established in Task 1.
- Produces: Figma-aligned welcome, gender, pronoun, city, birthday, and social-verification pages with unchanged quiz callbacks.

- [ ] **Step 1: Write the failing tests**

Add assertions for the social input labels, birthday controls, and the shared skip handlers that distinguish these pages from generic quiz templates.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`

Expected: FAIL until the required controls and corrected layouts are present.

- [ ] **Step 3: Implement the layouts**

Use `ReferenceJourneyFrame`, Frinq typography and colors, the matching local Figma assets, and explicit container dimensions for each image/control. Keep all input values, skips, and selected choices connected to the current callbacks.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`

Expected: PASS.

### Task 3: Verify the implementation

**Files:**
- Test: `frinq-mobile/src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`
- Test: `frinq-mobile/src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts`

- [ ] **Step 1: Run focused onboarding tests**

Run: `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 2: Run static verification**

Run: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 3: Verify the rendered Android flow**

Reload the app, navigate through OTP into onboarding, and compare screenshots with the supplied Figma frames. Record any remaining visual mismatch before claiming completion.
