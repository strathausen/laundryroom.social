# laundryroom

**laundryroom.social** is a small, friendly place to organize local groups and their meetups: create a group, post meetups, let people rsvp, run a pledge board ("who brings what?"), print a poster with a qr code, and discuss things in between. no ads, no tracking, no selling of data.

- website: <https://www.laundryroom.social>
- source: <https://github.com/strathausen/laundryroom.social>
- roadmap: <https://www.laundryroom.social/en/pages/roadmap>

## Stack

This is a [Turborepo](https://turborepo.org) monorepo (pnpm workspaces), originally bootstrapped from [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo).

- **Web**: Next.js 15 (App Router), React 19, Tailwind CSS, [next-intl](https://next-intl.dev) for i18n (`de`, `en`, `es`, `fr`, `ro`)
- **API**: tRPC v11, end-to-end typesafe between server and clients
- **Database**: Postgres via Drizzle ORM (the dokku postgres plugin in production, any Postgres url such as Neon locally)
- **Auth**: [Better Auth](https://www.better-auth.com) with Google OAuth and email magic links (Resend), see [Auth](#3-auth)
- **Storage**: Vercel Blob for group and profile images (only needs `BLOB_READ_WRITE_TOKEN`)
- **Hosting**: one Docker image on a self-hosted [dokku](https://dokku.com) box, see [Deployment](#deployment)
- **LLM**: OpenAI via Instructor for content moderation and search text

```text
apps
  ├─ nextjs       the web app (Next.js 15, App Router, next-intl, tRPC server)
  └─ worker       background jobs: pg-boss consumers + cron schedules, bundled by esbuild
packages
  ├─ api          tRPC v11 routers (auth, profile, group, meetup, pledge, ...)
  ├─ auth         Better Auth server config (`auth`, `getSession`, the `Session` type)
  ├─ calendar     ical / calendar helpers
  ├─ db           Drizzle schema + client (Postgres)
  ├─ atproto      nsids, lexicons, record validation, GroupHost and handle/profile rules
  ├─ email        transactional email via Resend
  ├─ group-accounts  each group's atproto account (LocalPdsGroupHost, custodied credentials)
  ├─ jobs         job registry (names + zod payloads), the pg-boss instance, enqueue helpers
  ├─ llm          OpenAI + Instructor helpers
  ├─ ui           shadcn/ui based component library
  └─ validators   shared zod schemas
tooling
  ├─ eslint       shared eslint presets
  ├─ prettier     shared prettier config
  ├─ tailwind     shared tailwind config
  └─ typescript   shared tsconfig
Dockerfile        multi-stage image dokku builds on push (turbo prune → next build + worker bundle)
Procfile          `web: node apps/nextjs/server.js`, `worker: node --enable-source-maps apps/worker/dist/index.mjs`
app.json          dokku startup healthchecks (web: GET /en, worker: stays up 20 s)
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

Required config vars (what each one does is documented in [.env.example](./.env.example)): `POSTGRES_URL` (set by `postgres:link`), `APP_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_KEY`, `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`. Optional: the `GROUP_*` variables that turn on [group accounts](#group-accounts). Already covered, nothing to set: `NODE_ENV=production` is baked into the image and `PORT` is derived by dokku from the port mapping. Leftovers from Auth.js that nothing reads any more and can be removed with `dokku config:unset laundryroom AUTH_TRUST_HOST AUTH_DISCORD_ID AUTH_DISCORD_SECRET`. Register only `https://www.laundryroom.social/api/auth/callback/google` with Google (unchanged by the move to Better Auth); the apex redirects to www before the auth handler ever sees a request.

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

#### Worker (background jobs)

The same image also runs the job worker: the Procfile's `worker:` line, `node --enable-source-maps apps/worker/dist/index.mjs`. That file is a single esbuild bundle and needs no `node_modules`, except `sharp` for group avatars, which it loads from the standalone tree (without it, group profiles are published without an avatar). It runs [pg-boss](https://github.com/timgit/pg-boss) 12 against the same database as the web app.

- **One-time steps.** dokku starts only `web` on its own; every other Procfile process starts at scale 0. And dokku's default restart policy, `on-failure:10`, counts restarts over a container's whole life, so after 10 crashes between two deploys docker gives up and the worker stays down. Run both once on the box (the restart policy applies from the next deploy); later deploys keep them:

  ```bash
  dokku ps:scale laundryroom worker=1
  dokku ps:set laundryroom restart-policy on-failure   # no maximum; docker backs off up to 1 min between restarts
  ```

- **Database.** Nothing to set up. On its first start, pg-boss creates its tables in a separate `pgboss` schema in `laundryroom_db`, and a newer pg-boss migrates them on start. `pnpm db:push` (drizzle-kit, `public` schema only) never touches that schema. A dump of `laundryroom-db` includes the queued jobs.
- **Config.** Nothing extra for the worker itself: it uses `POSTGRES_URL` from `postgres:link`. `WORKER_HEARTBEAT_CRON` (default `*/15 * * * *`, utc) is only worth changing for a local test. Of the `GROUP_*` variables of [group accounts](#group-accounts), the web app reads only `GROUP_PDS_URL` and `GROUP_HANDLE_DOMAIN`; the worker reads all of them and refuses to start while they are incomplete or invalid.
- **Checking it works.** `dokku logs laundryroom -p worker -t` shows `[worker] ready`, one `heartbeat (startup)` line per start, and a `heartbeat (schedule)` line every 15 minutes. `dokku ps:report laundryroom` lists the worker container. A dead worker is otherwise silent (the web app keeps enqueueing), so whatever alerting watches the box should also check that the newest completed heartbeat is under 30 minutes old:

  ```sql
  select max(completed_on) from pgboss.job where name = 'heartbeat' and state = 'completed';
  ```

- **Deploys and restarts.** The `worker` startup check in [app.json](./app.json) fails the deploy if a new worker does not stay up for 20 s (bad config, database unreachable). On dokku 0.37 the old worker keeps running after a successful deploy for the app's `wait-to-retire` (60 s by default), so old and new worker both take jobs for a minute or two. Then dokku runs `docker stop` on it: SIGTERM, and SIGKILL after the app's `stop-timeout-seconds` (30). On SIGTERM the worker stops fetching jobs, gives running ones up to 20 s, fails whatever is left so it gets retried, closes its pool and exits. (dokku 0.38 sends the SIGTERM right after the deploy instead.) An unhandled error makes it exit non-zero, and the restart policy above starts it again.
- **Connections.** The worker's pg-boss pool is capped at 3. With group accounts on it also opens the drizzle pool (at most 10, in practice one or two) and the lock pool (at most 4, one per running group job). The web app's pool is 10, its lock pool 4, and its send-only pg-boss pool 2, all within dokku postgres's 100, even while old and new containers overlap during a deploy.
- **Adding a job.** Add it to the registry ([packages/jobs/src/registry.ts](./packages/jobs/src/registry.ts)) with sample payloads in `registry.test.ts`, write its handler in [apps/worker/src/handlers.ts](./apps/worker/src/handlers.ts), then `enqueue("name", payload)` from the server. Payloads are JSON (dates as ISO strings). Because the outgoing worker keeps running for a minute or two after a deploy, a payload change must stay readable by the old and the new handler: add optional fields only, or use a new queue name. A job that must not be lost gets `retryLimit` of at least 1 and a `retryDelay` longer than that overlap.

Locally, `pnpm dev` leaves the worker out. `pnpm dev:worker` starts it, against the `POSTGRES_URL` in `.env` unless one is given inline, and its first start creates the `pgboss` schema in that database, so point it at a local one (`WORKER_HEARTBEAT_CRON='* * * * *'` makes the cron fire every minute):

```bash
createdb laundryroom_jobs_test
POSTGRES_URL=postgresql://localhost/laundryroom_jobs_test pnpm dev:worker
```

To try the production bundle against the same database instead:

```bash
pnpm -F @laundryroom/worker build
POSTGRES_URL=postgresql://localhost/laundryroom_jobs_test WORKER_HEARTBEAT_CRON='* * * * *' node --enable-source-maps apps/worker/dist/index.mjs
# ctrl-c stops it gracefully; dropdb laundryroom_jobs_test afterwards
```

#### Group accounts

Every group gets its own atproto account on the group pds (`pds.lndry.social`, phase 3 of [docs/atproto-plan.md](./docs/atproto-plan.md)): a did, a handle, and for public groups a public `social.laundryroom.group.profile` record. Code: [packages/group-accounts](./packages/group-accounts). It is off until configured, and off means nothing changes for anyone.

- **What is public.** Only a group that is `active`, that moderation left alone (the sitemap's rule) and that has been active for a day gets a readable handle (`foodiespace.lndry.social`) and a public profile (name, description, location text, time zone, image; nothing about members). The day is the owner's chance to make a new group private or hidden before anything permanent happens: new groups start out active, and the create form and the status switcher say so. Every other group gets an opaque `g-xxxxxx` handle and publishes nothing. Going private takes the profile down and swaps to an opaque handle right away; going active again publishes a day later, with the group's own handle back. Old handles stay in the plc log forever. The group page shows the handle ("on the network") for public groups only.
- **Handles.** A group's readable handle is claimed in `group.readable_slug` before the pds is asked for it and kept while the group is not public, so nobody else takes it meanwhile; an older public group's name is claimed before a newer group can take it. A taken handle gets `-2` or a short suffix. Names the pds reserves (`HandleNotAvailable`) or refuses, names on our deny list (`laundryroom`, `lndry`, `bluesky`, `bsky`, `atproto` anywhere; `admin`, `support`, `official`, `pds`, … as the whole name; see `packages/atproto/src/groups/handle.ts`) and names without latin letters keep an opaque handle, also while public.
- **Who writes.** Only the worker: trpc queues `group.ensureAccount` (a new group), `group.syncProfile` (an edit, a status change; also while the feature is off, for a group that has an account) and `group.retireAccount` (deleting a group while the feature is on: it is archived at once, then the worker deletes the profile, deactivates the account and deletes the row) inside the same transaction as the change, after its access check. Names and descriptions go through moderation together. The browser never sees a group credential; the app password and the master password are stored aes-256-gcm encrypted in `group_credential`.
- **Limits.** Each user creates at most 3 groups a day while the feature is on. The worker creates at most 60 accounts an hour, writes a group's profile at most once a minute, and keeps to 800 relay events an hour for all groups together (the relay takes 2,600 an hour and 21,000 a day per host); what is over waits. Taking something off the network never waits.
- **Setup, once.** Run the migration first, then set the variables (documented in [.env.example](./.env.example)) on the app, which restarts web and worker. The worker refuses to start while only some of them are set or one is invalid, so a typo fails the deploy instead of switching the feature off:

  ```bash
  ssh falkenstein 'dokku postgres:connect laundryroom-db' < packages/db/migrations/2026-10-05-group-accounts.sql
  dokku config:set laundryroom \
    GROUP_PDS_URL=https://pds.lndry.social \
    GROUP_HANDLE_DOMAIN=lndry.social \
    GROUP_EMAIL_DOMAIN=lndry.social \
    GROUP_PDS_ADMIN_PASSWORD=<pds-social's PDS_ADMIN_PASSWORD> \
    GROUP_PDS_RATE_LIMIT_BYPASS_KEY=<pds-social's PDS_RATE_LIMIT_BYPASS_KEY> \
    GROUP_CREDENTIAL_KEY_1="$(openssl rand -base64 32)"
  ```

  Keep an offline copy of `GROUP_CREDENTIAL_KEY_1` with the other keys: without it the stored group passwords are gone (then every group needs the recovery below). `dokku logs laundryroom -p worker` says `group accounts on (https://pds.lndry.social, *.lndry.social)` after the restart.

  The web app only reads `GROUP_PDS_URL` and `GROUP_HANDLE_DOMAIN`. The admin password (it can reset, take down or delete every group account) and the credential keys (with `POSTGRES_URL` they decrypt every stored group password) are the worker's alone, but web and worker are one dokku app today and share its config, so the web container carries them too. Before switching this on, consider running the worker as its own dokku app from the same image (`laundryroom-worker`, scaled to `web=0 worker=1`, linked to `laundryroom-db`) and setting the three secrets only there. Treat the `groups+…@lndry.social` mailbox like the keys: whoever reads it can reset a group's password (`GROUP_EMAIL_DOMAIN` must be the handle domain or under it).
- **Backfill existing groups, once, by hand** (never on deploy). New groups get their account a day after they are created; the groups that existed before need the one-off command, which only queues jobs for the worker. Start with foodiespace, check it, then the rest, oldest first, 10 per batch, one account a minute, which keeps the relay well under its 2,600 events per hour and host:

  ```bash
  dokku run laundryroom node apps/worker/dist/backfill-group-accounts.mjs --group <foodiespace's group id>
  dokku run laundryroom node apps/worker/dist/backfill-group-accounts.mjs            # all groups without an account
  dokku logs laundryroom -p worker -t                                                 # one line per group
  ```

  `--batch-size` and `--spacing` change the pace, `--resync` re-syncs every group that already has an account (after a moderation change made in the database that makes a group public again, or a key rotation), `--help` explains. The relay takes 100 accounts per new pds host; the worker warns from 80 on, so ask bluesky to raise the limit for `pds.lndry.social` in time. Locally (like `pnpm dev:worker`, it reads `.env` unless the variables are given inline, so point it at a local database): `POSTGRES_URL=postgresql://localhost/<db> pnpm -F @laundryroom/worker backfill-group-accounts [options]`.
- **When a job fails.** Network trouble, rate limits and pds errors are retried with backoff for about a day. A failure retrying cannot fix (an invalid record, a refused or undecryptable credential) is logged as `GIVING UP` with the group id and what to do, and the job completes. Every hour the worker queues a sync for each group that still has something on the network it must not have (a readable handle or a profile while not public: a failed sync, or moderation changed in the database), so such a group keeps logging `GIVING UP` until it is fixed. A deleted group whose account cannot be reached with its credential is taken down with the pds admin password (`com.atproto.admin.updateSubjectStatus`); if even that fails, the group stays archived and the worker says so. Check for stuck jobs with `select name, state, count(*) from pgboss.job where name like 'group.%' group by 1, 2;`.
- **Recovering a lost credential (the custody drill).** When the worker says a group's credential is lost, refused or does not decrypt, recover it with the pds admin password: a new random master password (`com.atproto.admin.updateAccountPassword`), a new `laundryroom-writer` app password, both stored encrypted the way the worker reads them, then a sync is queued. Prints no secret:

  ```bash
  dokku run laundryroom node apps/worker/dist/recover-group-credential.mjs --group <group id>
  ```

  The drill: pick a test group, `delete from group_credential where group_id = '<id>';`, watch its next sync give up, run the command, watch the sync succeed.
- **Rotating the credential key.** Set `GROUP_CREDENTIAL_KEY_2` to a new key and keep `_1`; new secrets use `_2`, and rows move to it as the worker reads them (`--resync` reads them all). Once `select key_id, count(*) from group_credential group by 1` shows one key id, move the new key into `_1` and unset `_2`.
- **Locally.** Against a local `@atproto/dev-env` pds (http on localhost is accepted; set `GROUP_PLC_URL` to its plc) and a local database, never a production one. `pnpm -F @laundryroom/group-accounts test` with `GROUP_ACCOUNTS_CONTRACT_PDS_URL`, `_ADMIN_PASSWORD` and `_HANDLE_DOMAIN` set also runs the contract test against that pds (see the top of `src/local-pds-group-host.contract.test.ts`); without them, `pnpm test` skips it.

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
