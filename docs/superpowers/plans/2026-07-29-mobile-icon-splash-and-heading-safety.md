# Mobile Icon, Splash, and Heading Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the supplied Frinq app icon, make cold launch smooth, prevent Borel heading clipping, and visually align onboarding to supplied references.

**Architecture:** Android uses the provided icon for launcher and native launch layers; the existing JavaScript boot splash presents the same mark with a short native-driver animation. `BrandHeading` centrally retains Android font padding so Borel ascenders cannot be clipped. Individual pages only receive evidence-backed layout adjustments after reference comparison.

**Tech Stack:** React Native, TypeScript, React Native Animated, Android XML resources, Jest, Android Gradle.

## Global Constraints

- Use `frinq-mobile/Public/App_icon.png`; never substitute generated artwork.
- Keep the operating-system status bar visible; never draw fake time, Wi-Fi, cellular, or battery UI.
- Preserve Borel headings, Vastago Grotesk body type, supplied onboarding order, and all live auth/quiz behavior.
- Inspect every supplied pre-quiz reference after install for clipping, alignment, art orientation, and legacy UI.
- Do not change backend APIs, quiz data, or authentication semantics.

---

### Task 1: Centralize Borel top-safe heading metrics

**Files:**
- Modify: `frinq-mobile/src/design/components/Text.tsx`
- Modify: `frinq-mobile/src/design/__tests__/components.test.tsx`

**Interfaces:**
- Produces: `BrandHeading` renders Android display headings with `includeFontPadding` enabled.
- Consumes: Existing `BrandHeading` props and `typeScale`; callers do not change.

- [ ] **Step 1: Write the failing safety regression test**

```tsx
it('keeps Android font padding for Borel display headings', () => {
  const { getByRole } = render(<BrandHeading>find your frinq</BrandHeading>);
  expect(getByRole('header').props.includeFontPadding).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --runInBand src/design/__tests__/components.test.tsx`

Expected: FAIL because `includeFontPadding` is missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
<RNText {...rest} accessibilityRole="header" includeFontPadding style={[typeScale[variant], { color: TONE[tone] }, style]}>
  {children}
</RNText>
```

Keep per-screen Borel line heights at or above their font size; adjust outer spacing rather than reducing line height.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/design/__tests__/components.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frinq-mobile/src/design/components/Text.tsx frinq-mobile/src/design/__tests__/components.test.tsx
git commit -m "fix: prevent clipped mobile display headings"
```

### Task 2: Use supplied icon for Android launch identity

**Files:**
- Create/replace: density-specific PNG assets under `frinq-mobile/android/app/src/main/res/mipmap-*`
- Modify: `frinq-mobile/android/app/src/main/res/drawable/launch_screen.xml`
- Modify: `frinq-mobile/src/navigation/placeholders.tsx`
- Modify: `frinq-mobile/src/navigation/__tests__/routing.test.tsx`

**Interfaces:**
- Produces: installed launcher/native launch and `AppLaunchSplash` use the Frinq mark; splash keeps `testID="app-launch-splash"` and adds `testID="app-launch-splash-icon"`.
- Consumes: supplied source icon and current boot-state transition.

- [ ] **Step 1: Write failing splash identity test**

```tsx
it('renders the Frinq mark during cold launch', () => {
  const { getByTestId } = render(<AppLaunchSplash />);
  expect(getByTestId('app-launch-splash-icon')).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand src/navigation/__tests__/routing.test.tsx`

Expected: FAIL because `app-launch-splash-icon` does not exist.

- [ ] **Step 3: Write minimal implementation**

Generate legacy/adaptive Android launcher density assets from `App_icon.png`; point the native launch drawable at the matching resource. Replace the JS launch image with `Animated.Image`, its new test id, and 180ms opacity plus 0.96→1 scale animation using `useNativeDriver: true`. Do not introduce a timeout or hide the real status bar.

```tsx
const opacity = React.useRef(new Animated.Value(0)).current;
const scale = React.useRef(new Animated.Value(0.96)).current;
React.useEffect(() => {
  Animated.parallel([
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
    Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 170, useNativeDriver: true }),
  ]).start();
}, [opacity, scale]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand src/navigation/__tests__/routing.test.tsx`

Expected: PASS.

- [ ] **Step 5: Build/install check**

Run: `.\gradlew.bat assembleDebug --offline --no-daemon -PreactNativeArchitectures=x86_64 --console=plain` from `frinq-mobile/android`, then `adb -s emulator-5554 install -r app\build\outputs\apk\debug\app-debug.apk`.

Expected: Gradle succeeds and ADB prints `Success`.

- [ ] **Step 6: Commit**

```bash
git add frinq-mobile/Public/App_icon.png frinq-mobile/android/app/src/main/res frinq-mobile/src/navigation/placeholders.tsx frinq-mobile/src/navigation/__tests__/routing.test.tsx
git commit -m "feat: apply Frinq mobile icon and launch transition"
```

### Task 3: Reference-led visual alignment pass

**Files:**
- Modify when visual evidence requires it: `frinq-mobile/src/design/components/ReferenceJourneyFrame.tsx`
- Modify when visual evidence requires it: `frinq-mobile/src/features/auth/screens/*.tsx`
- Modify when visual evidence requires it: `frinq-mobile/src/features/legal/screens/LegalAcceptanceScreen.tsx`
- Modify when visual evidence requires it: `frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx`
- Test: owning existing screen/template tests

**Interfaces:**
- Produces: `1 → 3 → 5 → 16 → 17 → 7 → 2 → 4 → 6 → 14 → 15 → 9 → 10 → 8 → 11` retains its live flow and matches each supplied image's structure.
- Consumes: source PNGs in `frinq-mobile/Public/Assets/Frinq UI/` and existing screen callbacks.

- [ ] **Step 1: Capture and compare each route with its reference**

For each page verify: no old layout, Borel top fully visible, artwork upright/uncropped, CTA/back-arrow placement, cream/maroon background, body text size, safe-area alignment. The real device status bar is allowed.

- [ ] **Step 2: Add a focused failing test for each discovered contract regression**

Example:

```tsx
expect(getByLabelText('Start finding your Frinq')).toBeTruthy();
```

Run the owning test first and confirm it fails before changing its component.

- [ ] **Step 3: Make only evidence-backed layout changes**

Adjust outer padding, image dimensions, and alignment through the shared frame/tokens. Never reintroduce mock status UI or the old intro. Retain safe Borel line-height.

- [ ] **Step 4: Verify and re-check visually**

Run focused tests, rebuild/install after asset or layout changes, and inspect each affected route again on the emulator.

- [ ] **Step 5: Commit**

```bash
git add frinq-mobile/src/design/components/ReferenceJourneyFrame.tsx frinq-mobile/src/features/auth/screens frinq-mobile/src/features/legal/screens/LegalAcceptanceScreen.tsx frinq-mobile/src/features/quiz/screens/templates/ReferenceOnboardingTemplate.tsx frinq-mobile/src/**/__tests__
git commit -m "fix: align mobile onboarding with references"
```

### Task 4: Full verification and handoff

**Files:**
- Modify only if verification exposes a real defect.

**Interfaces:**
- Produces: verified debug APK on `emulator-5554` and documented results.

- [ ] **Step 1: Run quality suite**

```powershell
cd frinq-mobile
npm run typecheck
npm run lint
npm test -- --runInBand --testPathIgnorePatterns=__tests__/verify-scripts.test.js
npm run verify:config
npm run verify:no-webview
npm run verify:assets
npm run verify:contracts
npm run verify:store-assets
```

Expected: typecheck passes, lint has zero errors, application tests pass, direct scripts pass.

- [ ] **Step 2: Final Android inspection**

Rebuild/install, launch `in.frinq.app`, capture via an ADB method that preserves PNG bytes, and inspect for startup crash or reference mismatch.

- [ ] **Step 3: Inspect runtime errors**

Run: `adb -s emulator-5554 logcat -d *:S ReactNative:V AndroidRuntime:E`

Expected: no new Frinq `AndroidRuntime` crash.

- [ ] **Step 4: Commit verification-only fix and report**

Run: `git status --short` and `git log --oneline -5`. Report icon source, animation, test/build results, reference pages inspected, and native status-bar decision.
