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

### App-specific commands
```bash
# Expo app (in apps/expo/)
pnpm dev:ios          # Start iOS simulator
pnpm dev:android      # Start Android emulator
```

## Architecture

This is a T3 Turbo monorepo using pnpm workspaces and Turborepo.

### Apps
- **apps/nextjs**: Next.js 14 web app with App Router, next-intl for i18n (locales: de, en, es, fr, ro)
- **apps/expo**: React Native app using Expo SDK 51, Expo Router, NativeWind
- **apps/auth-proxy**: Nitro server for OAuth proxy in preview deployments

### Packages
- **@laundryroom/api**: tRPC v11 router (routers: auth, profile, comment, discussion, group, meetup, pledge, promotion)
- **@laundryroom/db**: Drizzle ORM with Postgres/Supabase, schema definitions
- **@laundryroom/auth**: NextAuth.js authentication
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
- The `@laundryroom/api` package is a production dependency in Next.js, dev dependency in Expo (type-safety only)
- Shared validators in `@laundryroom/validators` are used by both API and clients
- UI copy is all-lowercase english; translations (`apps/nextjs/messages/*.json`) should be informal, casual, friendly, and concise

## Database

Uses Drizzle ORM with Vercel Postgres (Supabase). Main entities: User, Group, GroupMember, Meetup, Attendee, Discussion, Comment, Notification, PledgeBoard, Pledge, GroupPromotion.
