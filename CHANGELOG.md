# Changelog

All notable changes to the Codi project are documented in this file.

## [v0.2.0] - 2026-09-23

### Added
- **Course Browsing & Search (`/courses`)**:
  - Public course catalog and instant search for guest visitors and learners.
  - Real-time keyword filtering across title, description, and technology topics.
  - Multi-category filtering: `Frontend`, `Backend`, `Data & AI`, `Mobile`, `Computer Science`.
  - Level filters: `Beginner`, `Intermediate`, `Advanced`.
  - Course details dialog showing learning outcomes, prerequisites, and curriculum modules.
  - One-click registration routing and AI Mentor consultation buttons.
- **Dedicated User Profile Route (`/profile`)**:
  - Unified user-level profile page separated from workspace dashboards.
  - Profile name editing and Cloudflare R2 direct avatar upload integration.
  - Secure password change flow with active session revocation.
  - In-place email verification with 6-digit OTP countdown timer.
- **Radix UI NavigationMenu Primitives (`@codi-1/ui`)**:
  - Added modern, accessible `NavigationMenu` components compliant with system design tokens.
  - Upgraded sticky responsive Header with courses dropdown and role navigation.
- **Segmented Auth Tabs on `/login`**:
  - Segmented tab switcher between `Đăng nhập` and `Đăng ký`.
  - Preserved Google OAuth, GitHub OAuth, Remember Me, and Email OTP flows.

### Changed
- **Information Architecture & Business Flow**:
  - Separated role-based workspace (`/dashboard`) from universal user profile settings (`/profile`).
  - Removed duplicate inline profile tabs from dashboard to maintain a clean learning overview.
- **Design Tokens Standardization**:
  - Eliminated arbitrary tailwind colors (e.g. `bg-blue-200`, `text-emerald-500`, `text-amber-600`).
  - Standardized on semantic CSS variables and tokens (`primary`, `destructive`, `accent`, `border`, `card`, `background`, `foreground`).

---

## [v0.1.0] - 2026-09-22

### Added
- Initial fullstack monorepo setup with Turborepo, Next.js App Router, and pnpm workspaces.
- Supabase PostgreSQL database integration with Drizzle ORM.
- Better-Auth authentication layer supporting Email/Password, OTP, and session management.
- Cloudflare R2 S3-compatible cloud storage for user avatar assets.
- AI provider abstraction supporting Gemini and OpenAI with Varlock environment validation.
- CI/CD automation pipelines for Vercel deployment and type validation.
