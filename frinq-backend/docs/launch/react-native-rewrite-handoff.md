# Frinq Bare React Native Rewrite Handoff

**Updated:** 2026-07-23

**Repository root:** `F:\Project\Test\FrinqFull\Frinq`

**Implementation start:** Phase 7, Task 26

## Why this file exists

The product owner replaced the former Capacitor delivery direction with a true native consumer application built with the React Native Community CLI. This file tells a coding agent what changed, which documents are authoritative, how to preserve the current worktree, and where implementation resumes.

Do not implement from `App/Figma/plan.txt`. It is an obsolete prototype proposal. The screenshots and extracted images under `App/Figma/` are visual references only.

## Files changed for this decision

| File | Status | Purpose |
|---|---|---|
| `frinq-backend/docs/superpowers/specs/2026-07-23-frinq-bare-react-native-design.md` | Added | Approved native architecture, product/design direction, dependencies, storage, motion, accessibility, telemetry, and cutover rules |
| `frinq-backend/docs/superpowers/plans/2026-07-22-frinq-global-mobile-launch.md` | Revised | Keeps Phases 0-6 as historical delivery context and replaces Phase 7 onward with the bare React Native implementation/release plan |
| `frinq-backend/docs/launch/react-native-rewrite-handoff.md` | Added | Coding-agent entrypoint and safe continuation instructions |
| `frinq-backend/docs/launch/execution-ledger.md` | Appended | Records the 2026-07-23 direction change without claiming a freshly verified Phase 6 baseline |

No application source code was intentionally changed as part of this documentation pass. `frinq-mobile/` does not exist yet and is created only by Phase 7, Task 26.

## Read order and authority

Before changing code, read all three files completely in this order:

1. this handoff;
2. `frinq-backend/docs/superpowers/specs/2026-07-23-frinq-bare-react-native-design.md`;
3. `frinq-backend/docs/superpowers/plans/2026-07-22-frinq-global-mobile-launch.md`.

Then read every applicable `AGENTS.md` and repository-local instruction file before modifying files in that area.

Use this precedence when documents appear to conflict:

1. the owner's latest explicit instruction;
2. this handoff's revision/start-state rules;
3. the 2026-07-23 design spec for native product and architecture decisions;
4. Phase 7 and later in the implementation plan for task order and verification;
5. the current Phase 0-6 application behavior and API contracts.

Phases 0-6 in the plan are historical context. Their Capacitor and browser-consumer instructions describe how the current baseline was produced; they are not the path for the new mobile app. Never replay them just because a text search finds `Capacitor` in those historical sections.

If the running Phase 0-6 API differs from the plan, capture the exact response/test evidence and reconcile it explicitly. Do not silently change the backend contract to make native code easier.

## Current protected worktree

The owner reports Phases 0-6 complete, but the latest Phase 6 work is uncommitted. The last committed checkpoint currently visible is `55448d1 Phase_5`.

The worktree contains modified and untracked backend/frontend files, including legal, deletion, profile, tracking, chat, and realtime work. It also contains untracked:

- `App/Figma/Assets/`;
- `App/Figma/New folder/`;
- Borel, Motive, Urbanist, and Vastago font folders under frontend/admin public assets;
- the new native design spec.

All of these files belong to the owner. Do not discard, overwrite, move, clean, stage, or commit them as a baseline shortcut. Do not use `git reset --hard`, `git checkout --`, broad recursive deletion, or an unreviewed formatter over existing repositories.

At the start of Task 26:

1. record `git status --short`, `git diff --stat`, and `git log -8 --oneline`;
2. record Node, npm, Java, Android tooling, Python, and relevant package-manager versions;
3. enumerate the Figma/font inputs without altering them;
4. run current backend, frontend, and admin verification and record exact commands, exit codes, and counts;
5. update `frinq-backend/docs/launch/execution-ledger.md` with a new 2026-07-23 Phase 7 baseline section;
6. distinguish “owner reports complete” from newly verified evidence.

Do not rewrite the older ledger entries. Append the new evidence and note that the implementation direction changed after Phase 6.

## Approved implementation direction

- Create the production consumer app in a new sibling directory: `frinq-mobile/`.
- Use the React Native Community CLI and the React Native New Architecture.
- Do not install or use Expo, Expo Router, Capacitor, Ionic, a WebView shell, an HTML renderer, or a live website as the app runtime.
- Keep `frinq-frontend/` runnable as the behavior, copy, and API reference until native parity and Task 42 iOS validation pass.
- Only Task 43 may remove the consumer web routes and Capacitor runtime. Preserve public Terms, Privacy, Community Rules, Support, and deletion-information pages.
- Build phones only, portrait-first, with safe centered tablet compatibility.
- Support iOS 15.1 or later and Android API 24 or later; compile and target Android API 36.
- Use React Navigation 7, not the React Navigation 8 prerelease.
- Follow the exact compatibility matrix and Android audio spike in the design spec before committing to feature dependencies.

## Product and visual boundaries

The `App/Figma/` screenshots define the new visual mood: cream, maroon, peach, hand-drawn line art, outlined pills, expressive arrows/waves, playful gradients, Borel headings, and purposeful motion.

They do not authorize the matching-oriented concepts visible in some references. Do not add:

- dating or people matching;
- direct messages;
- location matching;
- gender or pronoun collection;
- social-account verification;
- photos/media chat;
- theme selection or dark mode.

The existing web app remains the behavioral and copy reference unless the approved native spec explicitly changes the presentation. The native app uses a community thread, not direct-message bubbles or a social feed. The Vibe result includes a collectible card plus the full report.

Accessibility wins over screenshot fidelity. Support large text, VoiceOver/TalkBack, visible focus/selection, reduced motion, sufficient contrast, scrollable constrained content, and platform-consistent semantics.

## Font licensing

Borel includes an OFL license and may be imported after the asset inventory check.

On 2026-07-23, the owner confirmed that the organization purchased Vastago and that its developer supplied the current font folder for building this app. Vastago is approved for use in `frinq-mobile/`; do not substitute another body/UI typeface.

In the native asset manifest, record the owner confirmation date, source folder, file checksums, and any distributable notice required by the organization's license. Do not commit receipts, order details, license keys, or confidential commercial records unless the owner explicitly authorizes a sanitized document.

## Execution workflow

Start at Phase 7, Task 26. Do not restart Phase 0 and do not create feature screens before the Phase 7 scaffold and architecture checks pass.

For every task:

1. inspect the real code and contracts named by the task;
2. write the stated failing test or verification first;
3. record the expected failure;
4. implement the smallest production change that satisfies the approved design;
5. run task verification;
6. record changed files, exact commands, exit codes, counts, artifacts, and risks in the ledger;
7. review the diff for unrelated edits, secrets, PII, deferred features, and native-web regressions.

Proceed sequentially through Phase 7, Phase 8, Phase 9, Phase 10, and Task 41 while their gates pass. Do not pause merely because a phase ended. Stop for:

- a real technical blocker with evidence;
- a product decision not covered by the approved design;
- missing authority for an external or irreversible action;
- Task 42, which requires the owner's Mac and physical iPhone.

Do not commit unless the owner explicitly authorizes commits. If authorization is later given, stage only the reviewed task files and use the plan's suggested checkpoint message.

## Single Mac and physical-iPhone gate

The owner is coding from Windows and does not want repeated Mac sessions. Android, JavaScript/TypeScript, state, API, accessibility, and release-configuration work must be exercised on Windows first. iOS must remain labeled **unverified** until Task 42.

When Task 41 is complete, stop once and provide:

- the exact Git commit or branch state the owner must push and check out;
- required macOS, Node, Ruby/CocoaPods, Xcode, and signing prerequisites;
- exact install and CocoaPods commands;
- exact Xcode workspace, scheme, configuration, and bundle/signing selections;
- how to connect, trust, and select the physical iPhone;
- exact clean-build, simulator, physical-device, microphone, push, background/terminated, reconnect, secure-session, large-text, VoiceOver, and release-archive checks;
- expected results for every check;
- the logs, screenshots, videos, crash output, and Xcode diagnostics the owner must return.

An iOS failure reopens the owning implementation task. Fix on Windows where possible, then provide one revised consolidated rerun rather than asking for casual repeated checks.

After the owner returns passing Task 42 evidence, execute Task 43 and the Phase 11 gate. Phases 12-13 have their own security, operations, store, deployment, and explicit-authorization gates.

## How to change this plan safely

When a new requirement arrives:

1. identify whether it changes product scope, architecture, task sequencing, or only implementation detail;
2. update the design spec first for product/architecture changes;
3. update every affected Phase 7+ task, gate, cross-reference, Definition of Done item, deferred-feature entry, coding-agent prompt, and official reference in the plan;
4. update this handoff when the start phase, file map, protected worktree, authority order, or manual-test strategy changes;
5. append the decision and its date to the execution ledger;
6. search all three documents for stale terms, task numbers, superseded paths, and contradictory gates;
7. do not edit completed Phase 0-6 history except to correct a factual safety issue, and label any such correction.

Required consistency searches include:

~~~powershell
rg -n "Expo|Capacitor|WebView|frinq-mobile|Task 42|Task 43|Phase 7|Phase 11|Vastago|iOS unverified" `
  frinq-backend/docs/launch/react-native-rewrite-handoff.md `
  frinq-backend/docs/superpowers/specs/2026-07-23-frinq-bare-react-native-design.md `
  frinq-backend/docs/superpowers/plans/2026-07-22-frinq-global-mobile-launch.md
~~~

Capacitor matches are acceptable only where the documents describe the superseded direction, the historical Phase 0-6 baseline, the delayed Task 43 cleanup, or a negative verification rule.

## Immediate next action

Execute Phase 7, Task 26 from the plan:

1. protect and freshly verify the existing Phase 6 baseline;
2. append the Phase 7 baseline to the execution ledger;
3. scaffold `frinq-mobile/` with the pinned React Native Community CLI version;
4. add the no-Expo/no-Capacitor/no-WebView verification;
5. prove the initial Android debug build and tests on Windows;
6. continue with Tasks 27-28 only after Task 26 passes.
