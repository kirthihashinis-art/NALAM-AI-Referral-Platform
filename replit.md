# NALAM AI

NALAM AI coordinates referrals and follow-up visits between community health workers and care facilities.

## Run & Operate

- `pnpm --filter @workspace/nalam-ai run dev` — run the Vite web app
- `pnpm --filter @workspace/api-server run dev` — run the Express API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required services/secrets: PostgreSQL (`DATABASE_URL`), Clerk authentication, and `OPENAI_API_KEY` for the assistant

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/nalam-ai` — bilingual React/Vite web application and visual theme
- `artifacts/api-server/src/routes/nalam.ts` — authenticated referral, patient, facility, follow-up, reporting, team, and assistant API
- `lib/api-spec/openapi.yaml` — source of truth for the API contract and generated client
- `lib/db/src/schema/nalam.ts` — PostgreSQL schema for NALAM data

## Architecture decisions

- Clerk authenticates users; application roles and facility assignments are stored in PostgreSQL and checked by the API.
- The first authenticated account becomes the initial administrator; later sign-ups stay pending until assigned. Register the owner account before sharing the app, and add invite-only enrollment before using it for an organization.
- OpenAI requests are made only from the API server using the workspace secret. The assistant is restricted to the referral workflow and must not receive patient details.
- Seeded records are fictional. Do not enter real patient information until privacy, security, access controls, retention, and legal requirements have been independently reviewed.

## Product

- Role-scoped patient and referral records, searchable referrals with status/facility/date filters, facility directory, follow-up scheduling, and saved-record reports.
- English and Tamil navigation and core referral workflow labels.
- The public assistant explains NALAM workflows; it is not a clinical decision tool and does not provide general medical advice.

## User preferences

- Keep the visual style futuristic but calm, with minimal animation.

## Gotchas

- Keep OpenAPI definitions and generated client/Zod schemas in sync by running codegen after contract changes.
- Use the managed API and web workflows for preview checks; never weaken authentication to make signed-in UI screenshots easier.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
