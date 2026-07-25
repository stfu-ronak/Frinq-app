# Frinq Native Accessibility Checklist (Task 40 Step 2)

Every item the plan requires, what automatically enforces it, and what still needs a real device
(covered by `docs/device-test-matrix.md`, Task 40 Step 3). "Automated" means a CI-run Jest test fails
if the invariant regresses — not a one-time manual confirmation that can silently rot.

| Requirement | Automated by | Real-device confirmation |
|---|---|---|
| Roles / accessible names / state | `src/__tests__/criticalJourneys.test.tsx` (NavRow, PrimaryButton, MessageComposer's send button, CommunityMessage's actions button) + `src/design/__tests__/components.test.tsx` (every other primitive: TextField, PhoneField, OtpField, ChoiceListRow, TagPicker, Dialog, QuizProgress) | TalkBack read-order sanity on the two riskiest screens (chat, quiz) — Task 38 already did this for chat live; Step 3 repeats for quiz/settings |
| 48dp minimum touch targets | `spacing.ts`'s `touchTarget.min`/`preferred` tokens + `criticalJourneys.test.tsx` asserts real component styles (composer input/send button, per-message actions button) meet them | Physical/emulator fat-finger pass — Step 3 |
| Color contrast (WCAG AA) | `src/design/__tests__/contrast.test.ts` — real WCAG relative-luminance ratio computed against every text/background pair the app actually renders (`tokens/colors.ts`), asserting 4.5:1 (text) / 3:1 (large text, UI components) | — (math, not device-dependent; a real display doesn't change color math) |
| 200% text scale | `src/design/__tests__/no-font-scale-caps.test.js` — source-scan: nothing in `src/` sets `allowFontScaling={false}` or `maxFontSizeMultiplier` (RN honors the OS setting by default; the only way to break this is to opt out, which is now impossible to do silently) | Visual layout check at 200% — already run for chat in Task 38; Step 3 repeats for quiz/vibe-report/settings |
| Reduced motion | `src/design/motion/__tests__/useReducedMotion.test.ts` (hook itself: initial value, live update, unsubscribe) + `PressableScale.test.tsx` (haptic is skipped under reduce-motion, press still works) | Visual confirmation that `FadeInView`'s stagger/translate is genuinely absent under the OS setting (animated-style values aren't observable through Jest's reanimated mock — this one gate is real-device-only) |
| No color-only meaning | `criticalJourneys.test.tsx` (failed message shows literal "couldn't send · retry" text, not just a color swap) + `components.test.tsx`'s "not color-only" ChoicePill/Card block (selection state exposed via `accessibilityState`, not color alone) | — |
| Keyboard-safe controls | `AndroidManifest.xml`'s `windowSoftInputMode="adjustResize"` (app-wide, confirmed present) + `Screen.tsx`'s `keyboardShouldPersistTaps`/`keyboardDismissMode` for scrollable screens | Real keyboard open/close over the composer and every text-entry screen — Step 3 |
| Decorative-art hiding | `src/design/__tests__/decorative-icon-hiding.test.js` — source-scan: every `<Svg>` in `src/` carries `accessibilityElementsHidden` within 3 lines of its opening tag | — |
| No per-message announcement | `criticalJourneys.test.tsx` — `CommunityMessage` never sets `accessibilityLiveRegion` (checked across sent/sending/failed states); `CommunityHeader` sets it exactly once, only while disconnected | Live TalkBack session confirming messages arrive silently and only connection-state changes are spoken — already run in Task 38's gap-closing pass |
| Focus order | — (RN's default focus order follows render order; no per-screen custom focus traps exist to verify) | TalkBack swipe-through on chat/quiz/settings — Step 3 |

**Net new test coverage from this task:** `contrast.test.ts` (13 tests), `no-font-scale-caps.test.js` (1),
`decorative-icon-hiding.test.js` (1), `useReducedMotion.test.ts` (3), `PressableScale.test.tsx` (4),
`criticalJourneys.test.tsx` (9) — 31 tests, all passing against the existing, unmodified app code. No
production code changed to make these pass; every invariant they check was already true — these gates
exist so a future change that breaks one of them fails CI instead of shipping silently.

## Task 45 Step 3 update — six specific failure categories, gap-checked and closed

The plan's exact wording: "Fail on missing accessible names, unlabeled controls, incorrect selection
state, inaccessible modal focus, controls below the approved token minimum, and screens that cannot
scroll at large text." Six categories, checked one by one against what Task 40 already covered — three
were genuine gaps, fixed this task; three were already solid.

| Category | Status before Task 45 | What changed |
|---|---|---|
| Missing accessible names / unlabeled controls | Solid for every icon-only control except one | `QuizHeader`'s "Go back" button had a real `accessibilityLabel` in source but no dedicated test — added to `components.test.tsx` |
| Incorrect selection state | Partial — `ChoicePill`/`ChoiceListRow` covered, `ChoiceCard` only label-tested, `SnapSlider` had **zero** test file, `MainTabs`' active-tab `accessibilityState.selected` untested | Added `ChoiceCard` selected-state assertion, a full new `SnapSlider.test.tsx` (5 tests: exactly-one-selected, none-selected-when-unanswered, tap reports value, touch target, adjustable role/value), and a `MainTabs` active-tab selection test |
| Inaccessible modal focus | Untested, and not pre-flagged anywhere | Every modal-like UI (`MessageActionSheet`, `ReportSheet`, `BlockDialog`, `PushOptInPrompt`) renders through `Sheet`/`Dialog`, both of which wrap RN's real native `Modal` with `accessibilityViewIsModal`. Focus-into-modal is therefore a **platform guarantee** (native modal window), not custom JS — confirmed structurally (`components.test.tsx`'s `Dialog`/`Sheet` describe blocks assert `accessibilityViewIsModal` is present while visible and the tree is empty while not). The one thing this can't prove is a live screen reader actually honoring it — that's real-device-only, added to `device-test-matrix.md` |
| Controls below the token minimum | Spot-checked (2 components in `criticalJourneys.test.tsx`) | Systematic sweep added to `components.test.tsx`: `ArrowButton`, `NavRow`, `PrimaryButton`, `ChoicePill`, `ChoiceListRow`, `TextField`, `PhoneField` (its wrapping row), `OtpField` (each digit box), `QuizHeader`'s back button, plus `SnapSlider`'s 5 dots in its own file |
| Screens that cannot scroll at large text | Untested; `Screen.tsx` defaults `scroll={false}` | **Real gap, fixed**: `SettingsScreen` (6 rows + button), `EditProfileScreen` (form), `PhoneScreen`/`OtpScreen` (centered content + guaranteed keyboard from `autoFocus`), and `DeleteAccountScreen`'s `otp_sent`/`type_delete` steps (the `confirm` step already scrolled — the other two were a real inconsistency) all switched to `<Screen scroll>`. Verified structurally in each screen's own test file (`UNSAFE_getByType(ScrollView)` — confirmed to fail without the fix, not just added). Screens with a single bounded row (Account/Community/Privacy/Notification settings) were checked and left as-is — genuinely too short to overflow even at 200% |
| Roles/names/state (general) | Already solid | No change |

**Net new/changed from Task 45:** `SnapSlider.test.tsx` (new, 5 tests), `components.test.tsx` (+11 tests:
ChoiceCard selection, 8 touch-target sweeps, QuizHeader, Dialog/Sheet modal-region), `MainTabs.test.tsx`
(+1), `settings.test.tsx`/`profile.test.tsx`/`authFlow.test.tsx`/`deleteAccount.test.tsx` (+1 scroll test
each), 5 screens switched to `<Screen scroll>`. Every scroll-fix test was confirmed to fail on the
pre-fix code before being left in place — not a vacuous assertion.
