# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
pnpm dev              # Start all apps in development mode (turbo watch)
pnpm dev:next         # Start only Next.js app and dependencies
pnpm build            # Build all packages
pnpm check            # Run lint:fix, format:fix, and typecheck
pnpm lint             # Run ESLint across all packages
pnpm lint:fix         # Run ESLint with auto-fix
pnpm format           # Check formatting with Prettier
pnpm format:fix       # Fix formatting with Prettier
pnpm typecheck        # Run TypeScript type checking
pnpm db:push          # Push Drizzle schema to database
pnpm db:studio        # Open Drizzle Studio
pnpm ui-add           # Add shadcn/ui components via interactive CLI
```

### Deployment
```bash
git push dokku main   # Deploy the web app: dokku builds the root Dockerfile, swaps containers after the app.json healthcheck
```

## Architecture

This is a T3 Turbo monorepo using pnpm workspaces and Turborepo.

### Apps
- **apps/nextjs**: Next.js 15 web app with App Router, React 19, next-intl 4 for i18n (locales: de, en, es, fr, ro)

### Packages
- **@laundryroom/api**: tRPC v11 router (routers: auth, profile, comment, discussion, group, meetup, pledge, promotion)
- **@laundryroom/db**: Drizzle ORM with Postgres, schema definitions
- **@laundryroom/auth**: Better Auth (Google OAuth + email magic links via Resend; exports `auth`, `getSession(headers)`, `Session`). The magic-link email links to the in-app `/auth/confirm` interstitial, not the verify endpoint, so link scanners cannot consume tokens. Atproto sign-in is an in-repo Better Auth plugin (`packages/auth/src/atproto/`): a confidential `@atproto/oauth-client-node` client (key in `ATPROTO_OAUTH_PRIVATE_JWK`; loopback public client in dev), Postgres-backed encrypted state/session stores with an advisory-lock `requestLock`, accounts found only by (`providerId "atproto"`, did) and never by email, and `/oauth-client-metadata.json`, `/oauth/jwks.json`, `/.well-known/did.json` route handlers. The plan for going fully native is `docs/atproto-plan.md`
- **@laundryroom/ui**: shadcn/ui components
- **@laundryroom/validators**: Shared Zod schemas
- **@laundryroom/llm**: OpenAI integration via Instructor
- **@laundryroom/email**: Email sending via Resend
- **@laundryroom/calendar**: Calendar utilities

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
- Production is one Docker image on a self-hosted dokku box: root `Dockerfile` (multi-stage on `node:22-bookworm-slim`, `turbo prune` → `pnpm install --frozen-lockfile` → `next build` with `output: "standalone"`), `Procfile` (`web: node apps/nextjs/server.js`) and `app.json` (startup healthcheck on `GET /en`). dokku injects all env vars at runtime; the image build runs with `SKIP_ENV_VALIDATION=1`, so no secret is needed to build. Keep `.nvmrc` and `tooling/github/setup/action.yml` on the same Node major as the image so lint/typecheck/CI exercise what serves traffic
- `APP_URL` is the canonical public origin (`http://127.0.0.1:3000` locally, because atproto's loopback oauth client must call back on 127.0.0.1 and the dev middleware moves localhost page views there; `https://www.laundryroom.social` in production): `metadataBase` and the sitemap are built from it. The email templates (`packages/email/src/email-templates.ts`), the meetup ical url (`packages/api/src/router/meetup.ts`) and `openGraph.url` in the root layout still hard-code `https://www.laundryroom.social`. The server-side tRPC client calls itself on `http://localhost:$PORT` (`apps/nextjs/src/trpc/react.tsx`)
- Image uploads stay on Vercel Blob (`BLOB_READ_WRITE_TOKEN`, `apps/nextjs/src/app/api/upload/route.ts`); nothing else depends on Vercel

## Database

Uses Drizzle ORM with Postgres via `POSTGRES_URL` (the dokku postgres plugin in production, a hosted dev database such as Neon locally). Main entities: User, Group, GroupMember, Meetup, Attendee, Discussion, Comment, Notification, PledgeBoard, Pledge, GroupPromotion.
