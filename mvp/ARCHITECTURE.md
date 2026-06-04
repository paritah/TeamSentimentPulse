# Team Sentiment Pulse - Architecture

## MVP Scope
- Single source only: bi-weekly pulse survey (Q1-Q8)
- No external API integrations
- SQLite + Prisma data layer
- Next.js App Router pages for dashboard, team/member drill-down, surveys, alerts, recommendations, retention, and settings

## Stack
- Framework: Next.js 16 App Router (TypeScript)
- Styling: Tailwind CSS v4
- ORM: Prisma
- Database: SQLite (`prisma/dev.db`)
- Seed runner: `tsx prisma/seed.ts`

## Data Flow
1. Survey responses are persisted in `PulseSurveyResponse`.
2. `SentimentScore` stores normalized and weighted derived metrics per member per cycle.
3. `RiskAlert` and `Recommendation` are generated from threshold rules during seed and can be reused by future scoring jobs.
4. Pages query Prisma directly in server components.
5. CSV export endpoint `/api/surveys/export` serializes survey rows for download.

## Scoring Model
- Composite score (0-100):
  - Q1 * 0.40
  - Q2 * 0.25
  - Q3 * 0.20
  - Q4 * 0.10
  - Q7 * 0.05
- Normalization: `(score - 1) / 9 * 100`
- Risk thresholds:
  - Green: >= 70
  - Yellow: 40-69
  - Red: < 40
- Disengagement score:
  - `((100 - composite) * 0.60) + (cyclesBelow4 * 8) + (q7LowFlag * 15)`

## Alert Triggers
- Sudden drop: composite drop >= 15
- Chronic low: composite < 40 for 3+ cycles
- Critical disengagement: disengagement > 80
- Low Job Satisfaction: Q2 <= 4
- Poor Work-Life Balance: Q3 <= 4
- Low Manager Support: Q4 <= 4
- Low Recommendation: Q7 <= 6

## Recommendation Framework
- Auto-generated recommendations map directly to score conditions (Q1/Q2/Q3/Q4/Q7 and sustained low composites).
- Recommendations include title, description, suggested action, priority, status, and target date.

## Anonymous Policy (MVP)
- Anonymous responses have `memberId = null`
- `anonymousToken` is non-identifying token placeholder
- Survey tables display anonymous rows as `Anonymous`
- Team-level aggregation remains enabled via grouped cycle/team views
