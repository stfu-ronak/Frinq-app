# frinq-frontend

The public Frinq website. **This is not the app** — Frinq's actual product (quiz, account, community
chat) is the native app in `../frinq-mobile`. This site is a small static export (`output: "export"` in
`next.config.ts`) covering only:

- `/` — a minimal landing page with app-store download links
- `/terms`, `/privacy`, `/community-rules` — legal documents
- `/support` — contact info
- `/delete-account` — account-deletion instructions (also the required Play Console external-deletion
  link target)

Everything else — the quiz, OTP login, community chat, profile/settings, account deletion itself — was
removed from this site in the Task 43 native cutover (see
`frinq-backend/docs/launch/execution-ledger.md`'s Task 43 entry for the full removal list and
reasoning). No Capacitor, no consumer session/token storage, no quiz state.

## Development

```bash
npm install
npm run dev       # http://localhost:3000
```

## Testing

```bash
npm test                      # vitest — app/lib/analytics.ts's consent/allowlist behavior
npx playwright test           # tests/e2e/legal-public-pages.spec.ts — retained pages render,
                               # former consumer/quiz/auth routes return 404
```

## Build

```bash
npm run build      # static export to out/
```

## Note on `public/illustrations` and `public/photos`

These are no longer referenced by any page after the Task 43 cutover (they were quiz-screen art).
Left in place rather than deleted — some (the `archetypes/` set) may be the only copies of licensed
illustration assets rather than duplicates of something bundled elsewhere; confirm before removing.
