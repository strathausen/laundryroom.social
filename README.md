# laundryroom

**laundryroom.social** is a small, friendly place to organize local groups and their meetups: create a group, post meetups, let people rsvp, run a pledge board ("who brings what?"), print a poster with a qr code, and discuss things in between. no ads, no tracking, no selling of data.

- website: <https://www.laundryroom.social>
- source: <https://github.com/strathausen/laundryroom.social>
- roadmap: <https://www.laundryroom.social/en/pages/roadmap>

## Stack

This is a [Turborepo](https://turborepo.org) monorepo (pnpm workspaces), originally bootstrapped from [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo).

- **Web**: Next.js 14 (App Router), React 18, Tailwind CSS, [next-intl](https://next-intl.dev) for i18n (`de`, `en`, `es`, `fr`, `ro`)
- **API**: tRPC v11, end-to-end typesafe between server and clients
- **Database**: Postgres via Drizzle ORM (the dokku postgres plugin in production, any Postgres url such as Neon locally)
- **Auth**: [Better Auth](https://www.better-auth.com) with Google OAuth and email magic links (Resend), see [Auth](#3-auth)
- **Storage**: Vercel Blob for group and profile images (only needs `BLOB_READ_WRITE_TOKEN`)
- **Hosting**: one Docker image on a self-hosted [dokku](https://dokku.com) box, see [Deployment](#deployment)
- **LLM**: OpenAI via Instructor for content moderation and search text

```text
apps
  └─ nextjs       the web app (Next.js 14, App Router, next-intl, tRPC server)
packages
  ├─ api          tRPC v11 routers (auth, profile, group, meetup, pledge, ...)
  ├─ auth         Better Auth server config (`auth`, `getSession`, the `Session` type)
  ├─ calendar     ical / calendar helpers
  ├─ db           Drizzle schema + client (Postgres)
  ├─ email        transactional email via Resend
  ├─ llm          OpenAI + Instructor helpers
  ├─ ui           shadcn/ui based component library
  └─ validators   shared zod schemas
tooling
  ├─ eslint       shared eslint presets
  ├─ prettier     shared prettier config
  ├─ tailwind     shared tailwind config
  └─ typescript   shared tsconfig
Dockerfile        multi-stage image dokku builds on push (turbo prune → next build, standalone output)
Procfile          `web: node apps/nextjs/server.js`
app.json          dokku startup healthcheck (GET /en) for zero-downtime deploys
```

All day-to-day commands (`pnpm dev`, `pnpm check`, `pnpm db:push`, ...) and the architecture notes live in [CLAUDE.md](./CLAUDE.md).

## Quick Start

> **Note**
> The [db](./packages/db) package talks to whatever Postgres `POSTGRES_URL` points at: a hosted dev database such as Neon locally (with `?sslmode=verify-full`), the dokku postgres plugin in production. If you use something more exotic, adjust the [client](./packages/db/src/client.ts) and the [drizzle config](./packages/db/drizzle.config.ts).

### 1. Setup dependencies

```bash
# Install dependencies
pnpm i

# Configure environment variables
# There is an `.env.example` in the root directory you can use for reference
cp .env.example .env

# Push the Drizzle schema to the database
pnpm db:push

# Start everything in watch mode (or `pnpm dev:next` for just the web app)
pnpm dev
```

Environment variables are loaded from the root `.env` by the per-package `with-env` scripts (`dotenv -e ../../.env --` in `apps/nextjs` and `packages/db`), which the `dev`, `build` and `db:*` scripts prefix internally, so you never need to run dotenv yourself. See [.env.example](./.env.example) for every variable and what needs it.

### 2. Auth

[packages/auth](./packages/auth/src/index.ts) configures [Better Auth](https://www.better-auth.com) (Drizzle adapter on the shared Postgres, google as social provider, the magic-link plugin sending through [packages/email](./packages/email/src/email-templates.ts)). The Next.js app mounts its handler at `/api/auth/[...all]`, so the google redirect uri is `https://www.laundryroom.social/api/auth/callback/google`. Sessions are database rows with a 30-day expiry, cached in a signed cookie for 5 minutes; tRPC procedures read `ctx.session.user.{id,email,name,image}` via `getSession(headers)`.

Two things are deliberate and worth knowing before touching them:

- **The magic-link email does not link to the verify endpoint.** Corporate mail scanners fetch every link, and a plain GET on Better Auth's `/api/auth/magic-link/verify` consumes the token and signs the bot in (that is how ~30k junk sign-ins happened under Auth.js). The mail links to `/auth/confirm?token=…&callbackURL=…`, an interstitial page in the app that only submits the token to the verify endpoint when a human presses the button. Tokens are valid for 15 minutes, single-use and stored hashed (`storeToken: "hashed"`), so a database read does not yield live sign-ins.
- **Rate limiting is on everywhere** (also in development): 60 requests per minute per ip on `/api/auth/*`, 3 magic-link requests and 10 verify attempts per 5 minutes. The client ip comes from `x-forwarded-for`, which the dokku nginx sets to a single address. This per-ip limit is the only server-side cap on outbound sign-in mail; the honeypot field on the login form is a client-side convenience against dumb form fillers, a direct `POST /api/auth/sign-in/magic-link` never sees it.

Existing users kept their uuids and profile columns in the Auth.js → Better Auth migration ([packages/db/migrations](./packages/db/migrations)); everyone signs in again, and google users get their account row re-linked on the first sign-in (account linking by verified email: google asserts `email_verified`, and the migration marks those users' rows as verified, which `requireLocalEmailVerified` insists on).

### 4a. When it's time to add a new UI component

Run the `ui-add` script to add a new UI component using the interactive `shadcn/ui` CLI:

```bash
pnpm ui-add
```

When the component(s) has been installed, you should be good to go and start using it in your app.

### 4b. When it's time to add a new package

To add a new package, simply run `pnpm turbo gen init` in the monorepo root. This will prompt you for a package name as well as if you want to install any dependencies to the new package (of course you can also do this yourself later).

The generator sets up the `package.json`, `tsconfig.json` and a `index.ts`, as well as configures all the necessary configurations for tooling around your package such as formatting, linting and typechecking. When the package is created, you're ready to go build out the package.

## Deployment

### Web app (dokku)

Production is one container on a self-hosted [dokku](https://dokku.com) box. On every push dokku builds the root [Dockerfile](./Dockerfile) (multi-stage: `turbo prune` → `pnpm install --frozen-lockfile` → `next build` with `output: "standalone"`), starts it from the [Procfile](./Procfile) (`web: node apps/nextjs/server.js`) and only routes traffic to the new container once the startup healthcheck in [app.json](./app.json) (`GET /en` on port 3000) passes. Postgres comes from the [dokku postgres plugin](https://github.com/dokku/dokku-postgres), image uploads stay on Vercel Blob (the token is all it needs). No secret is baked into the image; the build runs with `SKIP_ENV_VALIDATION=1` and everything is injected by dokku at runtime.

> **Note**

#### One-time setup on the server

```bash
# postgres, letsencrypt and redirect are plugins, not part of core dokku: install them once, as root
sudo dokku plugin:install https://github.com/dokku/dokku-postgres.git --name postgres
sudo dokku plugin:install https://github.com/dokku/dokku-letsencrypt.git
sudo dokku plugin:install https://github.com/dokku/dokku-redirect.git
sudo dokku letsencrypt:cron-job --add   # certificate auto-renewal

dokku apps:create laundryroom
dokku postgres:create laundryroom-db --image-version 18
# injects POSTGRES_URL=postgres://postgres:<pw>@dokku-postgres-laundryroom-db:5432/laundryroom_db (no ssl, docker network only)
dokku postgres:link laundryroom-db laundryroom --alias POSTGRES
# the Dockerfile EXPOSEs 3000; without this dokku would proxy public port 3000 instead of 80
dokku ports:set laundryroom http:80:3000
# both hosts, so the certificate covers the apex too; www is the only origin the app serves (see redirect:set below)
dokku domains:set laundryroom www.laundryroom.social laundryroom.social
dokku config:set laundryroom \
  APP_URL=https://www.laundryroom.social \
  AUTH_URL=https://www.laundryroom.social \
  AUTH_SECRET="$(openssl rand -base64 32)" \
  AUTH_GOOGLE_ID=... \
  AUTH_GOOGLE_SECRET=... \
  RESEND_KEY=... \
  OPENAI_API_KEY=... \
  BLOB_READ_WRITE_TOKEN=...
dokku letsencrypt:set laundryroom email you@example.com
dokku letsencrypt:enable laundryroom   # adds the https:443:3000 mapping
# 301 the apex to www at the nginx layer (http and https). Better Auth builds its callback
# urls from AUTH_URL and only trusts that origin, so a sign-in started on the apex would set
# its oauth state cookie on the apex and lose it on the www callback; a session cookie issued
# on one host is invisible on the other. Set it after letsencrypt:enable so the first issuance
# never depends on the redirect; renewals follow it fine.
dokku redirect:set laundryroom laundryroom.social www.laundryroom.social
```

Required config vars (what each one does is documented in [.env.example](./.env.example)): `POSTGRES_URL` (set by `postgres:link`), `APP_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_KEY`, `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`. Already covered, nothing to set: `NODE_ENV=production` is baked into the image and `PORT` is derived by dokku from the port mapping. Leftovers from Auth.js that nothing reads any more and can be removed with `dokku config:unset laundryroom AUTH_TRUST_HOST AUTH_DISCORD_ID AUTH_DISCORD_SECRET`. Register only `https://www.laundryroom.social/api/auth/callback/google` with Google (unchanged by the move to Better Auth); the apex redirects to www before the auth handler ever sees a request.

#### Deploying

```bash
git remote add dokku dokku@<your-host>:laundryroom   # once
git push dokku main
```

`dokku logs laundryroom -t` tails the app, `dokku ps:report laundryroom` shows the running container and `dokku checks:run laundryroom` re-runs the healthcheck by hand.

#### Schema changes

The image only contains the built app, not drizzle-kit, so schema pushes run from your laptop against the dokku database. Either expose the postgres container on the host for a moment or tunnel to it over ssh, then point `pnpm db:push` at it (an inline `POSTGRES_URL` wins over the one in `.env`).

```bash
# credentials (user, password, database name)
ssh dokku@<your-host> postgres:info laundryroom-db --dsn

# option a: expose it on a host port, push, unexpose again
ssh dokku@<your-host> postgres:expose laundryroom-db 5433
POSTGRES_URL='postgres://postgres:<pw>@<your-host>:5433/laundryroom_db' pnpm db:push
ssh dokku@<your-host> postgres:unexpose laundryroom-db

# option b: ssh tunnel straight to the service container, no public port at all
ssh -N -L 5433:$(ssh dokku@<your-host> postgres:info laundryroom-db --internal-ip):5432 root@<your-host> &
POSTGRES_URL='postgres://postgres:<pw>@localhost:5433/laundryroom_db' pnpm db:push
```

#### Backups

```bash
# s3 (or s3-compatible) credentials for the backup jobs; region, signature version and
# endpoint are only needed for non-default regions or non-aws stores
dokku postgres:backup-auth laundryroom-db <aws-access-key-id> <aws-secret-access-key> [<region> <signature-version> <endpoint-url>]
dokku postgres:backup-schedule laundryroom-db "0 3 * * *" <bucket-name>   # nightly at 03:00
dokku postgres:backup-schedule-cat laundryroom-db                          # shows the cron entry
dokku postgres:backup laundryroom-db <bucket-name>                         # one-off backup
dokku postgres:export laundryroom-db > laundryroom.dump                    # ad-hoc dump, restore with postgres:import
```

## License

MIT
