# Frinq — All 40 Changes Tracker

## Backend (High Priority)
- [x] 1. Quiz submissions table migration (002_quiz_submissions.sql)
- [x] 2. Claude Sonnet 4.6 AI insights engine (app/core/ai/insights.py)
- [x] 3. POST /api/v1/quiz/submit + GET /api/v1/quiz/summary/{id} endpoints
- [x] 4. GET /api/v1/admin/submissions endpoint (with full answers + insights)
- [x] 5. CORS middleware + router registration in main.py
- [x] 6. Backend deployed to DigitalOcean (https://frinq-backend-uqtbr.ondigitalocean.app)
- [x] 7. NEXT_PUBLIC_API_URL wired to frontend

## Frontend — Flow & Screens
- [x] 8. Phone collection screen added before /name
- [x] 9. Vibe-box connected to backend API with envelope build + pop animations
- [x] 10. Story page: replaced voice recorder with text input + skip
- [x] 11. S0 page: removed 'book club' quote, updated copy

## Frontend — Mobile Layout
- [x] 12. All pages: h-dvh overflow-hidden — no scroll on any screen
- [x] 13. Card grids: 2x2 compact layout on mobile (was full-width tall cards)
- [x] 14. Landing page: image repositioned, removed 'tap to get started'

## Frontend — Copy & Labels
- [x] 15. Scene: 'sober, always.' → 'i don't drink or smoke'
- [x] 16. Rapid fire: timer 5s → 10s, added 'choose one' context label
- [x] 17. Hobbies: added skip option, example placeholder text
- [x] 18. Interests: simplified question, 'fewer is fine' hint
- [x] 19. Red flags: simplified placeholders
- [x] 20. Preferences: removed 'go crazy' heading, cleaner labels
- [x] 21. Last question: CTA changed to 'see my profile'
- [x] 22. Connection: simplified question copy
- [ ] 23. Remove 'perfection.' label on ready page — PENDING
- [ ] 24. Remove 'sweet.' label on sweet page — PENDING
- [ ] 25. Remove 'glorious.' label on glorious page — PENDING

## Frontend — Design & UX
- [x] 26. Summary/vibe-box: full AI-generated profile reveal with insights
- [x] 27. Envelope build animation during AI processing
- [x] 28. Profile reveal: staggered slide-up animations per section
- [x] 29. 'Way forward' section added to profile reveal
- [ ] 30. Back button: fix clearing sessionStorage on navigation — PENDING
- [ ] 31. Opinions screen: redesign to feel different from rapid fire — PENDING
- [ ] 32. Slider: discrete 5-step stops, auto-continue on drag release — PENDING
- [ ] 33. Add more social type options (currently 4) — PENDING
- [ ] 34. Name page: fix image placement — PENDING (image removed, needs restore)
- [ ] 35. Sweet page: image placement — PENDING (image removed, needs restore)
- [ ] 36. Add selection feedback animation on card pick — PENDING
- [ ] 37. Scroll indicator on card option screens — PENDING (removed with no-scroll)

## Not Applicable / Deferred
- [ ] 38. Shareable social card (spirit animal branding) — DEFERRED
- [ ] 39. Admin panel frontend (view all submissions in UI) — DEFERRED
- [ ] 40. 'Show up for people' 2x2 grid — CONVERTED TO TEXT INPUT instead
