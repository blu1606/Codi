# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + Vite + react-router-dom (structure modelled on the FER `laptop-store-group7` project: `pages/`,
`components/`, `contexts/`), a thin Express API, and PostgreSQL in Docker (user decision 2026-11-01). This is a
prototype rebuild of the Codi mockup, not the production app in `../Codi/apps/web`.

## Users

- **Guest** — judges in under a minute whether a programming course fits, then acts without losing context when asked to sign in.
- **Learner (Học viên)** — buys a course, sets a goal, takes an entry test, studies along an AI-ranked personal path, and tracks progress.
- **Lecturer (Giảng viên)** — authors courses, reviews the AI-extracted knowledge map, requests publication, and clears a support backlog (grading, questions, reviews).
- **Admin (Quản trị viên)** — owns users, pricing, publication review, orders and vouchers, and reads business analytics.

## Product Purpose

Codi is a Vietnamese web platform that sells programming courses and personalises how each learner goes through a
course. Success: a learner goes from "I want this" to studying the right next lesson with one obvious path, and every
role always knows what needs their attention.

## Positioning

The learning path is AI-ranked but respects the course's prerequisite order, explains the reason for each step, and
re-ranks after every completed lesson; mastery is computed reproducibly (BKT), not by the LLM. The AI never starts a
use case and never applies an adjustment silently.

## Operating Context

Primary scene: a course-project demo projected to examiners (laptop 1366–1920 px, viewed from a distance), so
text, status and the next action must read from afar; mobile must still work (user decision 2026-11-02).
Payment is Vietnamese bank transfer only (VietQR, transfer content `CODI#####`, confirmed asynchronously). UI language
is Vietnamese; prices in VND. A prototype scenario drawer switches role and forces edge states (payment
expired/underpaid/slow/QR fail, AI failure, rate limit, knowledge-map cycle) for demos.

## Capabilities and Constraints

- Source of truth for flows, states and copy: the real app in `../Codi/apps/web` (stage 2 decision, 2026-11-01);
  `../Codi/docs/mockup/` fills only what the real app lacks. Deviations are listed in `docs/deviations-from-mockup.md`.
  Screens may be redrawn; their states may not be re-invented.
- Scope: feature parity with the real app for all four actors (AI advisor, tutor, grading drafts and knowledge-map
  generation simulated; analytics computed from seed data).
- AI responses are simulated from seed content; no real LLM or payment provider is called.

## Brand Commitments

Name "Codi". Kept through the 2026-11-02 redesign (user decision): deep cyan-teal accent, Be Vietnam Pro body,
Lexend headings, JetBrains Mono code, 5-stop mastery scale always paired with text, light + dark mode. Layouts
and composition are open to redesign; the design thinking of the video-preflight project is the
user's reference (summary: `plans/reports/design-reference-video-preflight-261102-1114.md`).
Tone: friendly, instructive Vietnamese. No `uppercase` on Vietnamese text.

## Evidence on Hand

Seed data (fictional sample content) from `../Codi/docs/mockup/js/data.js`; the JavaScript course carries real
content (F8 videos, javascript.info Vietnamese readings, CC BY-NC). Course and avatar imagery: real photographs
from free-licence stock (Unsplash/Pexels), credited (user decision 2026-11-02). No real testimonials, customers or
metrics exist; do not fabricate any.

## Product Principles

1. One primary action per screen; no dead ends.
2. Asynchronous status (payment, AI generation, grading) is always visible, and errors recover in place.
3. The AI explains rather than dictates; the learner stays in control.
4. Destructive and monetary actions state their consequence before they happen.

## Accessibility & Inclusion

WCAG 2.1 AA, visible focus ring, touch targets ≥ 44 px, status never conveyed by colour alone.
