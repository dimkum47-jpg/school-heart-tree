# 우리 학교 마음나무 — Codex 개발 가이드
- Source: adapted from dimkum47-jpg/school-webapp-template, keep web/ for GitHub Pages.
- Korean mobile-first school PWA with students (1–6, one class each), class officer accounts, and teacher admin.
- Static frontend NEVER stores any Firebase service-account key, password/PIN hash, admin secret or Worker secret.
- The Cloudflare Worker is the only authenticated Firestore reader/writer. Students access own records; officers only same grade; admin all grades.
- Public fruit must redact registered student names and never contain author identity fields. Officer must review private-content safety before approval.
- Reward payouts must use Firestore transactions and never exceed 2 per student in Monday–Sunday Asia/Seoul week.
- Do not deploy or modify connected accounts without explicit approval. Avoid replacing existing project-wide Firebase rules.
- Tests: npm test && npm run check && npm run build. Compare automated tests vs real service/device tests.
- Keep student names, numbered identities, school data and secrets out of third-party AI services. No Gemini AI is needed for this app.
