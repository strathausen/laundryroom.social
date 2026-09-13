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
- **Auth**: Auth.js (NextAuth) with Google OAuth and email magic links (Resend)
- **Storage**: Vercel Blob for group and profile images (only needs `BLOB_READ_WRITE_TOKEN`)
- **Hosting**: one Docker image on a self-hosted [dokku](https://dokku.com) box, see [Deployment](#deployment)
- **LLM**: OpenAI via Instructor for content moderation and search text
- **Mobile**: Expo SDK 51 / Expo Router / NativeWind (work in progress)

```text
apps
  ├─ expo         React Native app (Expo Router, NativeWind, tRPC client)
  └─ nextjs       the web app (Next.js 14, App Router, next-intl, tRPC server)
packages
  ├─ api          tRPC v11 routers (auth, profile, group, meetup, pledge, ...)
  ├─ auth         Auth.js configuration and session helpers
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

### 2. Configure Expo `dev`-script

#### Use iOS Simulator

1. Make sure you have XCode and XCommand Line Tools installed [as shown on expo docs](https://docs.expo.dev/workflow/ios-simulator).

   > **NOTE:** If you just installed XCode, or if you have updated it, you need to open the simulator manually once. Run `npx expo start` from `apps/expo`, and then enter `I` to launch Expo Go. After the manual launch, you can run `pnpm dev` in the root directory.

   ```diff
   +  "dev": "expo start --ios",
   ```

2. Run `pnpm dev` at the project root folder.

#### Use Android Emulator

1. Install Android Studio tools [as shown on expo docs](https://docs.expo.dev/workflow/android-studio-emulator).

2. Change the `dev` script at `apps/expo/package.json` to open the Android emulator.

   ```diff
   +  "dev": "expo start --android",
   ```

3. Run `pnpm dev` at the project root folder.

### 3. Configuring Auth.js to work with Expo

OAuth providers need a callback url they can reach. Two options:

- Point the Expo app at the deployed web app (`https://www.laundryroom.social`) and register `https://www.laundryroom.social/api/auth/callback/google` with your OAuth provider. This is what production does.
- For local development, add your local IP (e.g. `192.168.x.y:$PORT`) to your OAuth provider. This may not be as reliable as your local IP may change when you change networks. Some OAuth providers may also only support a single callback URL for each app making this approach unviable for some providers (e.g. GitHub).

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
> The Expo app talks to this deployment's `/api/trpc`, so the web app has to be up before the mobile app is useful in production.

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
# 301 the apex to www at the nginx layer (http and https). Auth.js rewrites every auth request
# to AUTH_URL, so a sign-in started on the apex would set its state/pkce cookies on the apex and
# lose them on the www callback ("pkce/state cookie was missing"); a session cookie issued on
# one host is invisible on the other. Set it after letsencrypt:enable so the first issuance
# never depends on the redirect; renewals follow it fine.
dokku redirect:set laundryroom laundryroom.social www.laundryroom.social
```

Required config vars (what each one does is documented in [.env.example](./.env.example)): `POSTGRES_URL` (set by `postgres:link`), `APP_URL`, `AUTH_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_KEY`, `OPENAI_API_KEY` and `BLOB_READ_WRITE_TOKEN`. Already covered, nothing to set: `NODE_ENV=production` is baked into the image, `AUTH_TRUST_HOST` is optional because `trustHost: true` is hardcoded in [packages/auth/src/config.ts](./packages/auth/src/config.ts), and `PORT` is derived by dokku from the port mapping. Register only `https://www.laundryroom.social/api/auth/callback/google` with Google; the apex redirects to www before Auth.js ever sees a request.

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

### Expo

Deploying the Expo application works differently compared to Next.js on the web. Instead of "deploying" your app online, you need to submit production builds of your app to app stores, like [Apple App Store](https://www.apple.com/app-store) and [Google Play](https://play.google.com/store/apps). You can read the full [guide to distributing your app](https://docs.expo.dev/distribution/introduction), including best practices, in the Expo docs.

1. Make sure to modify the `getBaseUrl` function in [apps/expo/src/utils/api.tsx](./apps/expo/src/utils/api.tsx) to point to your backend's production URL.

2. Set up [EAS Build](https://docs.expo.dev/build/introduction), which is short for Expo Application Services. The build service helps you create builds of your app, without requiring a full native development setup. The commands below are a summary of [Creating your first build](https://docs.expo.dev/build/setup).

   ```bash
   # Install the EAS CLI
   pnpm add -g eas-cli

   # Log in with your Expo account
   eas login

   # Configure your Expo app
   cd apps/expo
   eas build:configure
   ```

3. After the initial setup, you can create your first build. You can build for Android and iOS platforms and use different [`eas.json` build profiles](https://docs.expo.dev/build-reference/eas-json) to create production builds or development, or test builds. Let's make a production build for iOS.

   ```bash
   eas build --platform ios --profile production
   ```

   > If you don't specify the `--profile` flag, EAS uses the `production` profile by default.

4. Now that you have your first production build, you can submit this to the stores. [EAS Submit](https://docs.expo.dev/submit/introduction) can help you send the build to the stores.

   ```bash
   eas submit --platform ios --latest
   ```

   > You can also combine build and submit in a single command, using `eas build ... --auto-submit`.

5. Before you can get your app in the hands of your users, you'll have to provide additional information to the app stores. This includes screenshots, app information, privacy policies, etc. _While still in preview_, [EAS Metadata](https://docs.expo.dev/eas/metadata) can help you with most of this information.

6. Once everything is approved, your users can finally enjoy your app. For small fixes you can use EAS Update to ship a bugfix without going through the store review again. The steps below summarize the [Getting started with EAS Update](https://docs.expo.dev/eas-update/getting-started/#configure-your-project) guide.

   ```bash
   # Add the `expo-updates` library to your Expo app
   cd apps/expo
   pnpm expo install expo-updates

   # Configure EAS Update
   eas update:configure
   ```

7. Before we can send out updates to your app, you have to create a new build and submit it to the app stores. For every change that includes native APIs, you have to rebuild the app and submit the update to the app stores. See steps 2 and 3.

8. Now that everything is ready for updates, let's create a new update for `production` builds. With the `--auto` flag, EAS Update uses your current git branch name and commit message for this update. See [How EAS Update works](https://docs.expo.dev/eas-update/how-eas-update-works/#publishing-an-update) for more information.

   ```bash
   cd apps/expo
   eas update --auto
   ```

   > Your OTA (Over The Air) updates must always follow the app store's rules. You can't change your app's primary functionality without getting app store approval. But this is a fast way to update your app for minor changes and bug fixes.

## License

MIT
