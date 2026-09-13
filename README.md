# laundryroom

**laundryroom.social** is a small, friendly place to organize local groups and their meetups: create a group, post meetups, let people rsvp, run a pledge board ("who brings what?"), print a poster with a qr code, and discuss things in between. no ads, no tracking, no selling of data.

- website: <https://www.laundryroom.social>
- source: <https://github.com/strathausen/laundryroom.social>
- roadmap: <https://www.laundryroom.social/en/pages/roadmap>

## Stack

This is a [Turborepo](https://turborepo.org) monorepo (pnpm workspaces), originally bootstrapped from [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo).

- **Web**: Next.js 14 (App Router), React 18, Tailwind CSS, [next-intl](https://next-intl.dev) for i18n (`de`, `en`, `es`, `fr`, `ro`)
- **API**: tRPC v11, end-to-end typesafe between server and clients
- **Database**: Postgres on Supabase via Drizzle ORM and the Vercel Postgres driver
- **Auth**: Auth.js (NextAuth) with Google OAuth and email magic links (Resend)
- **Storage**: Vercel Blob for group and profile images
- **LLM**: OpenAI via Instructor for content moderation and search text
- **Mobile**: Expo SDK 51 / Expo Router / NativeWind (work in progress)

```text
apps
  ├─ auth-proxy   Nitro server that proxies OAuth requests in preview deployments
  ├─ expo         React Native app (Expo Router, NativeWind, tRPC client)
  └─ nextjs       the web app (Next.js 14, App Router, next-intl, tRPC server)
packages
  ├─ api          tRPC v11 routers (auth, profile, group, meetup, pledge, ...)
  ├─ auth         Auth.js configuration and session helpers
  ├─ calendar     ical / calendar helpers
  ├─ db           Drizzle schema + client (Postgres / Supabase)
  ├─ email        transactional email via Resend
  ├─ llm          OpenAI + Instructor helpers
  ├─ ui           shadcn/ui based component library
  └─ validators   shared zod schemas
tooling
  ├─ eslint       shared eslint presets
  ├─ prettier     shared prettier config
  ├─ tailwind     shared tailwind config
  └─ typescript   shared tsconfig
```

All day-to-day commands (`pnpm dev`, `pnpm check`, `pnpm db:push`, ...) and the architecture notes live in [CLAUDE.md](./CLAUDE.md).

## Quick Start

> **Note**
> The [db](./packages/db) package is preconfigured to use Supabase with the [Vercel Postgres](https://github.com/vercel/storage/tree/main/packages/postgres) driver. If you're using something else, adjust the [schema](./packages/db/src/schema.ts), the [client](./packages/db/src/client.ts) and the [drizzle config](./packages/db/drizzle.config.ts).

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

In order to get Auth.js to work with Expo, you must either:

#### Deploy the Auth Proxy (RECOMMENDED)

In [apps/auth-proxy](./apps/auth-proxy) you can find a Nitro server that proxies OAuth requests. By deploying this and setting the `AUTH_REDIRECT_PROXY_URL` environment variable to the URL of this proxy, you can get OAuth working in preview deployments and development for Expo apps. See more deployment instructions in the [auth proxy README](./apps/auth-proxy/README.md).

By using the proxy server, the Next.js app will forward any auth requests to the proxy server, which will handle the OAuth flow and then redirect back to the Next.js app. This gives you a stable, publicly accessible URL that doesn't change for every deployment and doesn't depend on which port the app is running on.

#### Add your local IP to your OAuth provider

You can alternatively add your local IP (e.g. `192.168.x.y:$PORT`) to your OAuth provider. This may not be as reliable as your local IP may change when you change networks. Some OAuth providers may also only support a single callback URL for each app making this approach unviable for some providers (e.g. GitHub).

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

### Next.js

> **Note**
> The Next.js application with tRPC must be deployed in order for the Expo app to communicate with the server in a production environment.

The web app is deployed on [Vercel](https://vercel.com). If you've never deployed a Turborepo app there, the [official Turborepo guide](https://vercel.com/docs/concepts/monorepos/turborepo) covers the details.

1. Create a new project on Vercel, select the `apps/nextjs` folder as the root directory. Vercel's zero-config system should handle all configurations for you.

2. Add the environment variables from [.env.example](./.env.example) (at minimum `POSTGRES_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `RESEND_KEY`, `BLOB_READ_WRITE_TOKEN`).

3. Done! Your app should successfully deploy. Assign your domain and use that instead of `localhost` for the `url` in the Expo app so that your Expo app can communicate with your backend when you are not in development.

### Auth Proxy

The auth proxy is a Nitro server that proxies OAuth requests in preview deployments. This is required for the Next.js app to be able to authenticate users in preview deployments. The auth proxy is not used for OAuth requests in production deployments. To get it running, it's easiest to use Vercel Edge functions. See the [Nitro docs](https://nitro.unjs.io/deploy/providers/vercel#vercel-edge-functions) for how to deploy Nitro to Vercel.

Then, there are some environment variables you need to set in order to get OAuth working:

- For the Next.js app, set `AUTH_REDIRECT_PROXY_URL` to the URL of the auth proxy.
- For the auth proxy server, set `AUTH_REDIRECT_PROXY_URL` to the same as above, as well as the OAuth client id and secret for your provider(s). Lastly, set `AUTH_SECRET` **to the same value as in the Next.js app** for preview environments.

Read more about the setup in [the auth proxy README](./apps/auth-proxy/README.md).

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
