# Repository Guidelines

## Project Structure

This repository contains four application areas:

- `frinq-mobile/` — React Native product app; source is under `src/`, tests under `__tests__/`, and native projects under `android/` and `ios/`.
- `frinq-frontend/` — public Next.js static site, with routes in `app/`, assets in `public/`, unit tests in `tests/`, and Playwright tests in `tests/e2e/`.
- `frinq-admin/` — Next.js admin dashboard, with routes and components in `app/` and fonts/assets in `public/`.
- `frinq-backend/` — FastAPI service; application code is in `app/`, operational scripts in `scripts/`, and pytest suites in `tests/`.

Keep secrets in local `.env` files; commit only `.env.example` changes when configuration needs documenting.

## Build, Test, and Development Commands

Run commands from the relevant application directory:

- Mobile: `npm start`, `npm run android`, `npm run ios`, and `npm run verify` (typecheck, lint, Jest, and release/config checks).
- Public frontend: `npm run dev`, `npm run build`, `npm run lint`, `npm test`, and `npx playwright test`.
- Admin: `npm run dev`, `npm run build`, and `npm run lint`.
- Backend: activate `.venv`, install `pip install -r requirements.txt`, run `uvicorn app.main:app --reload`, and run `pytest`.

## Coding Style & Naming

Use TypeScript/TSX with two-space indentation and existing ESLint/Prettier conventions. Use `PascalCase` for React components, `camelCase` for functions and variables, and descriptive kebab-case route folders. Python follows standard four-space indentation, `snake_case` names, and pytest conventions. Make focused changes and keep shared behavior in existing modules rather than adding speculative abstractions.

## Testing Guidelines

Add or update tests with behavior changes. Name Python tests `test_*.py`; colocated frontend tests use `.test.ts`/`.test.tsx`, and browser tests use `.spec.ts`. Run the narrowest relevant test first, then the application-level verification command before submitting.

## Commits and Pull Requests

Recent commits use short imperative/conventional prefixes such as `feat:`, `fix:`, and `chore:` (for example, `fix: summary generation latency`). Follow that style, keep commits focused, and explain any migration or configuration impact. Pull requests should include a concise summary, validation commands and results, linked issue/spec when applicable, and screenshots or recordings for UI changes.
