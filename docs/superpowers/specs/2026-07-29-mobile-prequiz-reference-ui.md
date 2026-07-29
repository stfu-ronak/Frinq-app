# Mobile Pre-Quiz Reference UI Design

## Goal

Replace every pre-quiz mobile screen with live React Native UI that visually matches the supplied `frinq-mobile/Public/Assets/Frinq UI/iPhone 17 - *.png` references. The existing authenticated quiz engine and dynamic question types remain the source of truth after the user presses the final quiz-start CTA.

## Required screen order

`1 -> 3 -> 5 -> 16 -> 17 -> 7 -> 2 -> 4 -> 6 -> 14 -> 15 -> 9 -> 10 -> 8 -> 11 -> quiz`.

| Reference | Live screen | Behaviour |
| --- | --- | --- |
| 1 | Landing | Arrow advances to the introduction. |
| 3 | Frequency introduction | `Find your Frinq` advances to the duck introduction. |
| 5 | Duck introduction | `Let's go` advances to location security. |
| 16 | Location security | In-app security acknowledgement only; never declares, requests, stores, or sends device location. Both actions advance to privacy. |
| 17 | Privacy consent | Persists pending Terms/Privacy acceptance, then advances to name. |
| 7 | Name | Saves the existing pre-auth quiz name and advances to phone. |
| 2 | Phone | Calls existing OTP request and non-blocking quiz-start APIs. |
| 4 | OTP | Uses existing six-digit verification and resend countdown. |
| 6 | Welcome | Reads the saved name; first authenticated quiz step. |
| 14 | Identity | Stores one existing supported gender value. |
| 15 | Pronouns | Optional quiz answer; skip remains available. |
| 9 | City | Uses existing city answer persistence. |
| 10 | Birthday | Uses existing DOB answer persistence and validation. |
| 8 | Social verification | Uses existing optional LinkedIn/Instagram answer keys. |
| 11 | Quiz start | Advances into unchanged dynamic MCQ/text/rapid-fire templates. |

## Visual system

- Display headings use `Borel-Regular` only.
- Body copy, fields, labels, buttons, and error text use Vastago Grotesk only.
- Brand maroon: `#621407`; canvas white: `#FFFBF7`; standard body gray: `#545454`.
- Existing peach (`#FFE8D6`) is a supporting CTA/gradient surface only.
- Reuse the supplied `Public/Assets` artwork: `dudes 1.png`, `dudes 2.png`, `dudes 3.png`, `location.png`, `Privacy.png`, `telephone 1.png`, `cooking pot 1.png`, `fire.png`, and arrows.
- Reference PNGs are visual authority, not full-screen application overlays; system status/home indicators are not rendered by the app.
- All screens use safe-area insets, real accessible controls, responsive content widths, explicit line heights, and keyboard-safe scrolling. No former landing/onboarding visual treatment remains reachable in the fresh-user flow.

## Data and safety boundaries

- Preserve the current OTP, legal acceptance, pending quiz, quiz-start, draft flush, and server-authoritative boot-state flows.
- Do not add geolocation permissions, Android location manifest entries, GPS collection, or location API calls. City remains a user-entered quiz value.
- The requested identity/pronoun screens use the existing backend-supported `gender` and `pronoun` quiz answer keys; pronouns are optional. No new backend endpoint or schema is required.
- Do not change dynamic admin-authored quiz configuration, summary generation, analytics semantics, or post-quiz tabs.

## Acceptance criteria

- A fresh user sees the exact screen sequence above with no old pre-quiz UI.
- OTP and legal consent keep their real backend effects.
- Welcome is personalized from the saved name.
- Skipping location, pronouns, or social verification does not block progress.
- Copy does not clip at standard Android font scaling and input screens remain usable with the keyboard open.
- Existing MCQ, text, voice/text, tags, rapid-fire, and opinions question types follow the reference-11 start page.
