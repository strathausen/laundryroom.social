# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm dev              # Start all apps except the job worker in development mode (turbo watch)
pnpm dev:next         # Start only Next.js app and dependencies
pnpm dev:worker       # Start only the job worker (tsx watch). Uses POSTGRES_URL from .env unless given inline, and creates the pgboss schema there
pnpm build            # Build all packages
pnpm check            # Run lint:fix, format:fix, and typecheck
pnpm lint             # Run ESLint across all packages
pnpm lint:fix         # Run ESLint with auto-fix
pnpm format           # Check formatting with Prettier
pnpm format:fix       # Fix formatting with Prettier
pnpm typecheck        # Run TypeScript type checking
pnpm test             # Run the node:test suites (packages/atproto, packages/jobs, packages/group-accounts; its dev-env contract test only runs when pointed at a pds)
pnpm db:push          # Push Drizzle schema to database
pnpm db:studio        # Open Drizzle Studio
pnpm ui-add           # Add shadcn/ui components via interactive CLI
```

### Deployment
```bash
git push dokku main   # Deploy web + worker: dokku builds the root Dockerfile, swaps containers after the app.json healthchecks
dokku ps:scale laundryroom worker=1   # one-time owner step on the box: non-web Procfile processes start at scale 0
dokku ps:set laundryroom restart-policy on-failure   # one-time: dokku's default on-failure:10 stops restarting after 10 crashes per container
dokku logs laundryroom -p worker -t  # worker logs; a heartbeat line every 15 minutes and one per start
dokku run laundryroom node apps/worker/dist/backfill-group-accounts.mjs [--group <id>] [--resync]   # one-off, by hand: queue group accounts for existing groups (README, "Group accounts")
dokku run laundryroom node apps/worker/dist/recover-group-credential.mjs --group <id>   # one-off, by hand: custody recovery of a group whose stored credential is lost or refused (pds admin password)
```

## Architecture

This is a T3 Turbo monorepo using pnpm workspaces and Turborepo.

### Apps
- **apps/nextjs**: Next.js 15 web app with App Router, React 19, next-intl 4 for i18n (locales: de, en, es, fr, ro)
- **apps/worker**: the background job worker (pg-boss consumers and cron schedules). esbuild bundles it with every dependency into `apps/worker/dist/index.mjs` (plus the one-offs `dist/backfill-group-accounts.mjs` and `dist/recover-group-credential.mjs`), which needs no `node_modules` at runtime except the native `sharp` (kept external, loaded from the standalone tree's node_modules for group avatars; without it profiles go out without an avatar). Handlers and recurring schedules are in `apps/worker/src/handlers.ts`

### Packages
- **@laundryroom/api**: tRPC v11 router (routers: auth, profile, comment, discussion, group, meetup, pledge, promotion)
- **@laundryroom/db**: Drizzle ORM with Postgres, schema definitions
- **@laundryroom/auth**: Better Auth (Google OAuth + email magic links via Resend; exports `auth`, `getSession(headers)`, `Session`). The magic-link email links to the in-app `/auth/confirm` interstitial, not the verify endpoint, so link scanners cannot consume tokens. Atproto sign-in is an in-repo Better Auth plugin (`packages/auth/src/atproto/`): a confidential `@atproto/oauth-client-node` client (key in `ATPROTO_OAUTH_PRIVATE_JWK`; loopback public client in dev), Postgres-backed encrypted state/session stores with an advisory-lock `requestLock`, accounts found only by (`providerId "atproto"`, did) and never by email, and `/oauth-client-metadata.json`, `/oauth/jwks.json`, `/.well-known/did.json` route handlers. The plan for going fully native is `docs/atproto-plan.md`
- **@laundryroom/ui**: shadcn/ui components
- **@laundryroom/validators**: Shared Zod schemas
- **@laundryroom/llm**: OpenAI integration via Instructor
- **@laundryroom/email**: Email sending via Resend
- **@laundryroom/calendar**: Calendar utilities
- **@laundryroom/atproto**: nsids (`src/nsid.ts`, the only place they are spelled out), lexicons and generated types, record validation (`buildRecord`/`parseRecord` before every write), the `GroupHost` / `GroupSpaceHost` / `GroupContentStore` interfaces, and the pure group rules in `src/groups/` (handles: readable vs opaque `g-xxxxxx`; `publishesOnNetwork` = active and moderation ok; the profile mapping)
- **@laundryroom/group-accounts**: each group's atproto account on the group pds (phase 3 of `docs/atproto-plan.md`). The main entry (web) only says whether the feature is on, from `GROUP_PDS_URL` and `GROUP_HANDLE_DOMAIN` alone (it never reads a secret); `/worker` holds `LocalPdsGroupHost` (plain fetch + zod xrpc, legacy sessions cached in memory, the `laundryroom-writer` app password for writes, the master password for app passwords and deactivation, the admin password for invites, custody recovery and takedowns), the encrypted credential store (`group_credential`, aes-256-gcm, key fingerprint per row; readable handle claims in `group.readable_slug`) and `syncGroupAccount`/`retireGroupAccount`/`recoverGroupCredential`. Off unless `GROUP_PDS_URL`, `GROUP_HANDLE_DOMAIN`, `GROUP_PDS_ADMIN_PASSWORD`, `GROUP_EMAIL_DOMAIN` (the handle domain or under it) and `GROUP_CREDENTIAL_KEY_1` (or `_2`, the rotation slot) are set; `GROUP_PDS_RATE_LIMIT_BYPASS_KEY` and `GROUP_PLC_URL` (default `https://plc.directory`) are optional. The worker refuses to start on a partial or invalid config
- **@laundryroom/jobs**: the job layer shared by web and worker: the typed registry (`src/registry.ts`: queue name → zod payload + queue options), the lazily started pg-boss singleton (`getBoss`, `stopBoss`), `enqueue`/`enqueueAt` for the web app, and `registerHandlers`/`syncSchedules` for the worker

### Tooling
- **tooling/eslint**: Shared ESLint configs
- **tooling/prettier**: Shared Prettier config
- **tooling/tailwind**: Shared Tailwind config
- **tooling/typescript**: Shared tsconfig

## Key Patterns

- Environment variables are defined at monorepo root (`.env`), loaded via `dotenv-cli` with `pnpm with-env`
- Database schema is in `packages/db/src/schema.ts` with Drizzle Zod schemas for validation
- tRPC routers are in `packages/api/src/router/`
- Next.js uses `[locale]` route segments for i18n
- The `@laundryroom/api` package is a production dependency in Next.js
- Shared validators in `@laundryroom/validators` are used by both API and clients
- UI copy is all-lowercase english; translations (`apps/nextjs/messages/*.json`) should be informal, casual, friendly, and concise
- Production is one Docker image on a self-hosted dokku box: root `Dockerfile` (multi-stage on `node:22-bookworm-slim`, `turbo prune` → `pnpm install --frozen-lockfile` → `next build` with `output: "standalone"`), `Procfile` (`web: node apps/nextjs/server.js`, `worker: node --enable-source-maps apps/worker/dist/index.mjs`) and `app.json` (startup healthcheck on `GET /en`; the worker must stay up 20 s). dokku injects all env vars at runtime; the image build runs with `SKIP_ENV_VALIDATION=1`, so no secret is needed to build. Keep `.nvmrc` and `tooling/github/setup/action.yml` on the same Node major as the image so lint/typecheck/CI exercise what serves traffic
- `APP_URL` is the canonical public origin (`http://127.0.0.1:3000` locally, because atproto's loopback oauth client must call back on 127.0.0.1 and the dev middleware moves localhost page views there; `https://www.laundryroom.social` in production): `metadataBase` and the sitemap are built from it. The email templates (`packages/email/src/email-templates.ts`), the meetup ical url (`packages/api/src/router/meetup.ts`) and `openGraph.url` in the root layout still hard-code `https://www.laundryroom.social`. The server-side tRPC client calls itself on `http://localhost:$PORT` (`apps/nextjs/src/trpc/react.tsx`)
- Background work goes through `@laundryroom/jobs`. To add a job: add an entry to `packages/jobs/src/registry.ts` (plus sample payloads in `registry.test.ts`), then a handler in `apps/worker/src/handlers.ts` (typecheck fails until it exists), then call `enqueue("name", payload)` from the server. The payload is zod-validated on enqueue and again before the handler runs. Handlers must be idempotent, because jobs are retried. Payloads are JSON (dates as ISO strings), and a payload change must stay readable by the previous deploy's worker (optional fields only, or a new queue name), since it keeps working for a minute or two after a deploy. Recurring jobs are declared only in the worker's `schedules` list, and `syncSchedules` deletes any schedule not on it. pg-boss keeps its tables in the `pgboss` postgres schema: whichever instance starts first creates or migrates it, and drizzle-kit (`schemaFilter` `public`) never touches it. Nothing connects at import time or during `next build`. Connection budget on dokku postgres (100): web drizzle pool 10, lock pool 4, web pg-boss 2 (only once it enqueues), worker pg-boss 3, plus the worker's drizzle pool (max 10) and lock pool (max 4) once group accounts are on (in practice one or two each). Double that during a deploy, when old and new containers overlap. On dokku 0.37 the old worker runs on for `wait-to-retire` (60 s) after a deploy, then gets SIGTERM, and SIGKILL after `stop-timeout-seconds` (30 s); on SIGTERM it stops fetching and gives running jobs 20 s, then fails and retries whatever is still running
- Group accounts: every write as a group goes through the worker. trpc runs its access check, then queues `group.ensureAccount` / `group.syncProfile` / `group.retireAccount` with `enqueueInTransaction` in the same transaction as the row change (a sync also while the feature is off, for a group that has an account; while it is on, every delete goes through `group.retireAccount`); nothing writes to a pds inside a request, and no group credential reaches a client or a log (job errors are logged and stored through `describeError`/`sanitizedError` only). Only groups that publish on the network (active, moderation ok, and active for a day: `group.active_since`, so a new group's owner can still make it private) get a readable handle and a public `social.laundryroom.group.profile`; all others an opaque `g-xxxxxx` handle and nothing else. A group keeps its readable handle claim (`group.readable_slug`) while it is not public. The handlers hold a per-group advisory lock, are idempotent, stop with the job's signal, retry network trouble with backoff and log `GIVING UP` on permanent errors; work for later (the end of the grace day, a spent relay budget) is queued with singletonKey `<group id>:later`, so it never blocks an immediate sync. An hourly `group.reconcileAccounts` re-queues groups that still publish what they must not. Existing groups get accounts only through the one-off backfill (README, "Group accounts"), never on deploy. Migration: `packages/db/migrations/2026-10-05-group-accounts.sql`
- Image uploads stay on Vercel Blob (`BLOB_READ_WRITE_TOKEN`, `apps/nextjs/src/app/api/upload/route.ts`); nothing else depends on Vercel

## Database

Uses Drizzle ORM with Postgres via `POSTGRES_URL` (the dokku postgres plugin in production, a hosted dev database such as Neon locally). Main entities: User, Group, GroupMember, Meetup, Attendee, Discussion, Comment, Notification, PledgeBoard, Pledge, GroupPromotion, GroupCredential (worker only: a group account's encrypted passwords).
