# Route wiring audit (2026-11-03)

Every frontend call resolves to an existing backend route file or server action, with matching HTTP methods. No
endpoint is missing.

## Still simulated

| Item | Where | What is simulated | Real replacement |
|---|---|---|---|
| Bank transfer at checkout | `frontend/src/features/commerce/checkout-page.jsx` (`runSimulation`) | Default scenario `success` auto-sends a paid transfer 6 s after the order appears | SePay webhook `POST /api/payments/sepay/callback` |
| QR code | `checkout-page.jsx` (`QrSvg`) | Placeholder pattern | Real VietQR payload (no server route yet) |
| Video without URL, PDF pages | `frontend/src/features/learning/lesson-materials.jsx` | Fake player and fake pages; progress commands are real | Real media player, pdf.js |
| Import from document, bulk import | `frontend/src/features/lecturer-ai/lecturer-ai-api.jsx` | No upload; 300 ms timer; output from `ai-bank.js`; save is real | `generateAiQuizQuestions` exists; no summary action |
| AI lesson and code draft | `lecturer-ai/lecturer-ai-create.jsx` | Body and quiz from local generators; code verification is real | `generateAiCodingTestCases`, `generateAiQuizQuestions` |
| AI rubric | `lecturer-ai-api.jsx` (`suggestRubric`) | Deterministic after 1.2 s | `backend/src/lib/assignment-rubric.ts` (not exposed) |
| AI publication pre-check | `frontend/src/features/admin/admin-publication.jsx` (`runAi`) | Client copy of `publication-service.ts` rules after 1.4 s | Expose backend `aiPrecheck` as an action |
| Dev drawer (Alt+K), demo login card | `shell/dev-drawer.jsx`, `shell/auth.jsx` | Shown in every build; demo password in the bundle | Gate out of production |

## Demo-only backend route

`POST /api/dev/simulate-payment` is the only one. It is live on production because `DEMO_TOOLS=true`: a signed-in
learner can mark their own pending order paid. It posts a SePay-shaped webhook to the real callback.

## Backend capability with no caller

`/api/payments/create-transaction`, `/api/payments/check-transaction/[id]` (legacy path),
`/api/learn/[courseId]/access/[lessonId]`, `/api/admin/insights/[card]`, `/api/admin/finance/[card]`,
`saveAiCourseDraft` / `decideAiCourseDraft`, `startQuizGeneration` / `readQuizGeneration`, `GET /api/avatar`.
