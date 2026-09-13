# syntax=docker/dockerfile:1

# Builds the web app (apps/nextjs) into one self-contained image. dokku builds it
# on `git push dokku main` and starts it via the Procfile. No secret is needed at
# build time: SKIP_ENV_VALIDATION=1 short-circuits the t3-env check that
# next.config.js runs through jiti; every real value is injected by dokku when
# the container starts (see .env.example and README.md).

# ---------------------------------------------------------------------------
# base: node + the pnpm version pinned in package.json#packageManager
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS base
# pnpm via npm instead of corepack on purpose: corepack's baked-in registry
# signing keys have broken `corepack prepare` on older images before (the
# january 2025 npm key rotation, "Cannot find matching keyid") and newer node
# releases no longer bundle corepack at all, so a plain npm install of the exact
# version is the boring, reproducible option.
RUN npm install -g pnpm@9.6.0

# ---------------------------------------------------------------------------
# pruner: shrink the monorepo to the workspaces @laundryroom/nextjs depends on
# (apps/expo drops out, the lockfile is pruned to match)
# ---------------------------------------------------------------------------
FROM base AS pruner
WORKDIR /app
COPY . .
# same version as the root devDependency (turbo ^2.10.12 resolves to 2.10.12 in the lockfile)
RUN pnpm dlx turbo@2.10.12 prune @laundryroom/nextjs --docker

# ---------------------------------------------------------------------------
# builder: install from the pruned lockfile, build the workspace packages, build next
# ---------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app

# Manifests + pruned lockfile first, so the install layer is only rebuilt when a
# package.json or the lockfile changes. out/json also carries .npmrc
# (node-linker=hoisted) and pnpm-workspace.yaml (the dependency catalogs).
COPY --from=pruner /app/out/json/ ./
# NODE_ENV is deliberately NOT set yet: pnpm skips devDependencies (typescript,
# tailwind, ...) under NODE_ENV=production. The root postinstall (`pnpm lint:ws`,
# i.e. `pnpm dlx sherif@latest`) is a workspace lint that CI already runs
# (.github/workflows/ci.yml); it would pull an unpinned package into this
# "frozen" layer and fail the deploy whenever a new sherif release adds a rule,
# so it is dropped for the image only. --ignore-scripts is not an option: it
# would also skip the dependencies' own install scripts. out/full restores the
# original package.json right below, nothing installs after this point.
RUN npm pkg delete scripts.postinstall && pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./

ENV SKIP_ENV_VALIDATION=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production

# 1. The workspace packages the app imports from dist/ (api, db, ui, validators, ...).
#    `<pkg>^...` selects the dependencies of <pkg> without <pkg> itself.
RUN pnpm turbo build --filter=@laundryroom/nextjs^...

# 2. The app itself, run directly instead of through its `pnpm with-env next build`
#    script: there is no ../../.env in the image (dotenv-cli tolerates a missing
#    file, but there is nothing to load either), and a direct `next build` keeps
#    the env this step sees explicit (turbo.json passes SKIP_ENV_VALIDATION
#    through, but nothing else here needs turbo). next.config.js sets
#    output: "standalone" with outputFileTracingRoot at the monorepo root, so the
#    server lands at apps/nextjs/.next/standalone/apps/nextjs/server.js
RUN pnpm --filter @laundryroom/nextjs exec next build

# ---------------------------------------------------------------------------
# runner: only the traced files, running as the unprivileged `node` user
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone tree mirrors the monorepo: apps/nextjs/server.js, apps/nextjs/.next,
# a root node_modules and the traced packages/*. public/ and .next/static are not
# part of the trace (next assumes a cdn serves them), so they are copied next to
# server.js where it looks for them. --chown so the node user can write
# .next/cache (image optimizer, isr) at runtime.
COPY --from=builder --chown=node:node /app/apps/nextjs/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/nextjs/.next/static ./apps/nextjs/.next/static
COPY --from=builder --chown=node:node /app/apps/nextjs/public ./apps/nextjs/public

USER node
EXPOSE 3000
CMD ["node", "apps/nextjs/server.js"]
