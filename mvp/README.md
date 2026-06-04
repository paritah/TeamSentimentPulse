# Team Sentiment Pulse (MVP)

Pulse Survey-first implementation of Team Sentiment Pulse with phased architecture support.

## Implemented in this MVP
- Pulse survey data model with named/anonymous mode
- Weighted sentiment scoring and risk thresholds
- Disengagement scoring
- Alert Center with severity and trigger types
- Recommendations framework (auto-generated)
- Dashboard, Team, Member, Surveys, Alerts, Retention, Settings screens
- CSV export for survey responses
- Prisma + SQLite schema and realistic seed data (5 teams x 8 members x 6 cycles)

## Tech Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- Prisma ORM
- SQLite

## Quick Start
1. Install dependencies:
   `npm install`
2. Run migration:
   `npm run db:migrate`
3. Seed demo data:
   `npm run db:seed`
4. Start app:
   `npm run dev`
5. Open `http://localhost:3000`

## Commands
- `npm run dev` - start dev server
- `npm run lint` - lint checks
- `npm run build` - production build
- `npm run db:migrate` - run Prisma migration
- `npm run db:seed` - seed demo data
- `npm run db:studio` - open Prisma Studio

## Page Routes
- `/` dashboard overview
- `/team/[id]` team detail
- `/member/[id]` member profile
- `/surveys` pulse survey results
- `/alerts` active alerts
- `/recommendations` recommendation list
- `/retention` churn risk view
- `/settings` survey management

## Notes
- Current implementation is MVP-only and intentionally pulse-survey constrained.
- Multi-source ingestion (Jira, communication, retention signals) is deferred to Phase 2.
- RBAC and enterprise connectors are deferred to Phase 3.
