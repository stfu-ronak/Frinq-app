# Mobile Pre-Quiz Reference UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mobile pre-quiz journey with live, responsive screens that match the supplied Frinq reference images while retaining real auth, legal, and quiz workflows.

**Architecture:** A shared reference-design frame owns safe areas, theme, waves, arrows, and CTA layout. `AuthNavigator` owns pre-auth screens through OTP. `QuizNavigator` retains its authenticated draft and renders special fixed onboarding steps before the unchanged dynamic question templates.

**Tech Stack:** React Native, TypeScript, React Navigation native stack, react-native-safe-area-context, Jest and React Native Testing Library.

## Global Constraints

- Use Borel only for headings and Vastago Grotesk for all body/UI text.
- Consume semantic tokens for `#621407` maroon, `#FFFBF7` canvas, and `#545454` gray.
- Follow exactly: `1 -> 3 -> 5 -> 16 -> 17 -> 7 -> 2 -> 4 -> 6 -> 14 -> 15 -> 9 -> 10 -> 8 -> 11 -> quiz`.
- Reuse named `frinq-mobile/Public/Assets` art; do not use reference PNGs as application pages.
- Location is informational security/privacy UI only: no GPS request, manifest permission, collection, or API call.
- Preserve OTP, pending legal acceptance, pending quiz state, draft flush, boot routing, and dynamic configured quiz contracts.
- Pronouns and social verification remain optional; gender, city, and birthday retain validation/persistence.

---

## File structure

- Create `frinq-mobile/src/design/components/ReferenceJourneyFrame.tsx`: cream/maroon safe-area frame, back control, wave, and arrow CTA.
- Create `frinq-mobile/src/features/auth/screens/ReferenceIntroScreen.tsx`: reference-3 introduction.
- Modify auth/navigation/legal screens: references 1, 5, 16, 17, 7, 2, and 4.
- Create `frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx`: references 6, 8, 9, 10, 11, 14, and 15.
- Modify quiz definition, draft allowlist, and `QuizStepScreen`: required fixed sequence and dispatcher.
- Add focused tests beside every changed module.

### Task 1: Establish reference visual primitives

**Files:** Create `frinq-mobile/src/design/components/ReferenceJourneyFrame.tsx`; test `frinq-mobile/src/design/__tests__/ReferenceJourneyFrame.test.tsx`.

**Produces:** `ReferenceJourneyFrame({ children, tone?: 'cream' | 'maroon', onBack?: () => void, wave?: boolean, scroll?: boolean })`.

- [ ] **Step 1: Write the failing test.**

```tsx
it('renders a cream frame with an accessible back control', () => {
  const { getByLabelText, getByTestId } = render(
    <ReferenceJourneyFrame onBack={jest.fn()}><Text>content</Text></ReferenceJourneyFrame>,
  );
  expect(getByTestId('reference-journey-frame')).toBeTruthy();
  expect(getByLabelText('Go back')).toBeTruthy();
});
```

- [ ] **Step 2: Run red.** Run `npm test -- --runInBand src/design/__tests__/ReferenceJourneyFrame.test.tsx`; expected: FAIL because the frame is absent.
- [ ] **Step 3: Implement the minimal safe-area frame.** It renders `SafeAreaView` with `testID="reference-journey-frame"`, an accessible `PressableScale` back control when `onBack` exists, cream/maroon semantic color, supplied arrow art, and an optional keyboard-safe `ScrollView`.
- [ ] **Step 4: Run green.** Run `npm test -- --runInBand src/design/__tests__/ReferenceJourneyFrame.test.tsx src/design/__tests__/tokens.test.ts`; expected: PASS.
- [ ] **Step 5: Commit.** Run `git add frinq-mobile/src/design/components/ReferenceJourneyFrame.tsx frinq-mobile/src/design/__tests__/ReferenceJourneyFrame.test.tsx` then `git commit -m "feat: add mobile reference journey primitives"`.

### Task 2: Replace unauthenticated navigation and introduction screens

**Files:** Create `frinq-mobile/src/features/auth/screens/ReferenceIntroScreen.tsx`; modify `frinq-mobile/src/navigation/AuthNavigator.tsx`, `LandingScreen.tsx`, `DudesIntroScreen.tsx`, `LocationPermissionScreen.tsx`, and `LegalAcceptanceScreen.tsx`; test `frinq-mobile/src/navigation/__tests__/referenceAuthFlow.test.tsx`.

**Produces:** Fresh-user flow `Landing -> ReferenceIntro -> DudesIntro -> LocationPermission -> Legal -> Name`; resumption returns to the earliest unfinished step.

- [ ] **Step 1: Write the failing navigation test.**

```tsx
it('reaches privacy after the reference location acknowledgement', async () => {
  const { getByLabelText, findByRole } = render(<AuthNavigator />);
  fireEvent.press(getByLabelText('Start finding your Frinq'));
  fireEvent.press(await findByRole('button', { name: 'Find your Frinq' }));
  fireEvent.press(await findByRole('button', { name: "Let's go" }));
  fireEvent.press(await findByRole('button', { name: 'Set location services' }));
  expect(await findByRole('button', { name: 'Accept' })).toBeTruthy();
});
```

- [ ] **Step 2: Run red.** Run `npm test -- --runInBand src/navigation/__tests__/referenceAuthFlow.test.tsx`; expected: FAIL because the route/order is absent.
- [ ] **Step 3: Implement live reference screens.** Add `ReferenceIntro` between `Landing` and `DudesIntro`; make reference-5 use `dudes 1.png`; make reference-16 use `location.png`, `Set location services`, and `Not now`, both navigating to `Legal`; make reference-17 use `Privacy.png`, `Accept`, and existing pending-acceptance persistence; route legal completion directly to `Name`; remove `QuizIntro` from fresh pre-auth routing.
- [ ] **Step 4: Run green.** Run `npm test -- --runInBand src/navigation/__tests__/referenceAuthFlow.test.tsx src/features/legal/__tests__/legalGate.test.tsx`; expected: PASS.
- [ ] **Step 5: Commit.** Run `git add frinq-mobile/src/navigation/AuthNavigator.tsx frinq-mobile/src/features/auth/screens frinq-mobile/src/features/legal/screens/LegalAcceptanceScreen.tsx frinq-mobile/src/navigation/__tests__/referenceAuthFlow.test.tsx` then `git commit -m "feat: replace mobile pre-auth reference journey"`.

### Task 3: Restyle name, phone, and OTP while preserving real effects

**Files:** Modify `NameScreen.tsx`, `PhoneScreen.tsx`, and `OtpScreen.tsx`; test `frinq-mobile/src/features/auth/__tests__/referenceCredentials.test.tsx`.

**Consumes:** Existing `savePendingQuizState({ name })`, `sendOtp(apiClient, digits)`, `startQuiz(apiClient, digits)`, and `verifyOtp(apiClient, phone, code)`.

- [ ] **Step 1: Write failing behavior tests.**

```tsx
it('saves the name before opening the reference phone screen', async () => {
  const { getByPlaceholderText, getByLabelText } = render(<NameScreen />);
  fireEvent.changeText(getByPlaceholderText('your name'), 'Rhea');
  fireEvent.press(getByLabelText('Continue with name'));
  await waitFor(() => expect(savePendingQuizState).toHaveBeenCalledWith({ name: 'Rhea' }));
});
```

- [ ] **Step 2: Run red.** Run `npm test -- --runInBand src/features/auth/__tests__/referenceCredentials.test.tsx`; expected: FAIL because the reference controls are absent.
- [ ] **Step 3: Implement references 7/2/4.** Use the shared frame, reference-7 underline input, reference-2 `+91` field with `telephone 1.png`, and reference-4 six-cell OTP/resend/full-width confirm layout. Keep current validation, API requests, errors, and post-verification flush unchanged.
- [ ] **Step 4: Run green.** Run `npm test -- --runInBand src/features/auth/__tests__/referenceCredentials.test.tsx src/features/auth/__tests__/authFlow.test.tsx`; expected: PASS.
- [ ] **Step 5: Commit.** Run `git add frinq-mobile/src/features/auth/screens/NameScreen.tsx frinq-mobile/src/features/auth/screens/PhoneScreen.tsx frinq-mobile/src/features/auth/screens/OtpScreen.tsx frinq-mobile/src/features/auth/__tests__/referenceCredentials.test.tsx` then `git commit -m "feat: restyle mobile credential pages"`.

### Task 4: Add fixed post-OTP reference steps

**Files:** Modify `frinq-mobile/src/features/quiz/domain/quizDefinition.ts` and `frinq-mobile/src/storage/quizDraftRepository.ts`; test `frinq-mobile/src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts`.

**Produces:** Fixed step ids `welcome`, `gender`, `pronoun`, `city`, `age`, `social_verification`, and `ready` before dynamic configured content.

- [ ] **Step 1: Write the failing sequence test.**

```ts
it('keeps the reference onboarding sequence before dynamic questions', () => {
  expect(ONBOARDING_PREFIX.map((step) => step.id)).toEqual([
    'welcome', 'gender', 'pronoun', 'city', 'age', 'social_verification', 'ready',
  ]);
});
```

- [ ] **Step 2: Run red.** Run `npm test -- --runInBand src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts`; expected: FAIL because the first three ids are absent.
- [ ] **Step 3: Implement typed steps.** Add `welcome` as intro, `gender` as existing supported single-choice identity values, and `pronoun` as optional text with placeholder `she/her, he/him, they/them`; add the `pronoun` answer key to the local draft allowlist only. Keep existing city, DOB, social verification, and ready steps after those three.
- [ ] **Step 4: Run green.** Run `npm test -- --runInBand src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts src/features/quiz/__tests__/quizDefinition.test.ts src/storage/__tests__/quizDraftRepository.test.ts`; expected: PASS.
- [ ] **Step 5: Commit.** Run `git add frinq-mobile/src/features/quiz/domain/quizDefinition.ts frinq-mobile/src/storage/quizDraftRepository.ts frinq-mobile/src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts` then `git commit -m "feat: add mobile reference onboarding steps"`.

### Task 5: Render reference 6/8/9/10/11/14/15 inside the quiz

**Files:** Create `frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx`; modify `QuizStepScreen.tsx` and `TextInputTemplate.tsx`; test `frinq-mobile/src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx` and `frinq-mobile/src/features/quiz/__tests__/quizJourney.test.tsx`.

**Produces:** `isReferenceOnboardingStep(id: string): boolean` and `ReferenceOnboardingTemplate` consuming the current step, draft answers, `onAnswer`, `onContinue`, and `onBack`.

- [ ] **Step 1: Write failing template tests.**

```tsx
it('personalizes welcome from the saved name', () => {
  const { getByText } = renderReferenceStep('welcome', { name: 'Rhea' });
  expect(getByText('Rhea')).toBeTruthy();
});

it('lets pronouns be skipped without persisting a value', () => {
  const { getByRole } = renderReferenceStep('pronoun', {});
  fireEvent.press(getByRole('button', { name: 'Skip pronouns' }));
  expect(mockNext).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run red.** Run `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx`; expected: FAIL because the template/dispatcher are absent.
- [ ] **Step 3: Implement special fixed-step rendering.** `QuizStepScreen` dispatches only these fixed ids to the new template. It renders welcome with `dudes 2.png`; gender pills; pronoun underline/skip; city chips + field; date fields; social links + skip; and reference-11 maroon disco/`dudes 3.png` CTA. All steps after `ready` keep existing generic templates unchanged.
- [ ] **Step 4: Run green.** Run `npm test -- --runInBand src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx src/features/quiz/__tests__/quizJourney.test.tsx src/navigation/__tests__/routing.test.tsx`; expected: PASS.
- [ ] **Step 5: Commit.** Run `git add frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx frinq-mobile/src/features/quiz/screens/QuizStepScreen.tsx frinq-mobile/src/features/quiz/screens/templates/TextInputTemplate.tsx frinq-mobile/src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx frinq-mobile/src/features/quiz/__tests__/quizJourney.test.tsx` then `git commit -m "feat: render reference onboarding inside mobile quiz"`.

### Task 6: Verify on the Android emulator

**Files:** Modify only if a reproducible defect from Tasks 1-5 is found.

- [ ] **Step 1: Run targeted tests.** Run `npm test -- --runInBand src/navigation/__tests__/referenceAuthFlow.test.tsx src/features/auth/__tests__/referenceCredentials.test.tsx src/features/quiz/domain/__tests__/quizDefinition.referenceOnboarding.test.ts src/features/quiz/screens/templates/__tests__/ReferenceOnboardingTemplate.test.tsx src/features/quiz/__tests__/quizJourney.test.tsx`; expected: PASS.
- [ ] **Step 2: Run project verification.** Run `npm run verify`; expected: exit 0. If the documented Windows child-process verifier issue repeats, capture it separately and run direct relevant type/component checks.
- [ ] **Step 3: Build/install.** Run `cd android; .\gradlew.bat assembleDebug --offline --no-daemon -PreactNativeArchitectures=x86_64 --console=plain`; expected: `BUILD SUCCESSFUL`. Then run `adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk`; expected: `Success`.
- [ ] **Step 4: Validate visible order.** Launch clean unauthenticated `in.frinq.app`; capture every named reference screen and confirm no former pre-quiz page is reachable and dynamic questions follow reference 11.
- [ ] **Step 5: Commit only verification fixes.** Run `git add frinq-mobile` then `git commit -m "fix: polish mobile reference onboarding"` when a code correction is required.

## Self-review

- Tasks 1-3 cover 1-5, 16-17, 7, 2, and 4; Tasks 4-5 cover 6, 14, 15, 9, 10, 8, and 11.
- Location safety, live OTP/legal behavior, draft preservation, and the dynamic-quiz boundary are explicit constraints and tested tasks.
- Every production unit begins with a focused failing test and a named verification command.
