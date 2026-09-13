# open tasks

state as of 2026-09-13, after the audit, the move to dokku, the switch to better auth and the next 15 upgrade. grouped by urgency; `→` marks the concrete next action.

## ops (do soon)

- **database backups** — none of the 13 postgres services on the falkenstein box are backed up, laundryroom included. neon used to do this silently. → get hetzner object storage credentials, then `dokku postgres:backup-auth laundryroom-db <key> <secret> <region> <endpoint>` and `dokku postgres:backup-schedule laundryroom-db "0 3 * * *" <bucket>`; consider the same for the other services.
- **decommission the old hosting** after a quiet week: delete the vercel project `laundryroom` (team `thefoodiespace`; it has no domains any more but still builds every push) and the neon database `verceldb`. keep the dns zone on vercel dns for now — it also holds the proton mail records — or move the zone to hetzner dns in one sitting.
- **uploads still live on vercel blob** (`BLOB_READ_WRITE_TOKEN`, `*.public.blob.vercel-storage.com`). works, costs nothing today, but it is the last vercel dependency. → move to hetzner object storage (s3 api) with presigned uploads and rewrite the stored `group.image` / `user.image` urls; update `images.remotePatterns`.
- **no product analytics** since `@vercel/analytics` was removed. → plausible or umami on the dokku box if wanted (beszel there is server monitoring only).
- local repo hygiene: `.cursorrules` (deleted) and `.vscode/settings.json` are still uncommitted local changes.

## product backlog (from the audit, in rough priority order)

1. **worker process + pg-boss** — `Procfile` gets a `worker:` line, `@laundryroom/worker` package, `boss.work()` consumers, `boss.schedule()` for cron. unlocks everything below.
2. **day-before reminder email** ("tomorrow: X at 19:00, 7 people going, still coming?") — the single most retention-relevant feature. needs a `reminder_sent_at` column on meetup and must honour the `email_notifications` user flag, which exists (`user.flags`) but is read nowhere; decide the default for existing users.
3. **email fan-out off the request path** — `meetup.upsert` still sends one resend request per recipient inside the trpc call (sequential, 2 req/s). enqueue instead; same for `comment.createComment`.
4. **private groups actually private** — `group.byId` and `meetup.byId` are public and return member/attendee names regardless of `status`; "private" is selectable but not enforced, and there is no join mechanism for private groups (join is by link). needs an access helper across five routers plus a discriminated return shape in the ui.
5. **waitlist with auto-promotion** — capacity + derived "full" shipped; the `waitlist` enum value and the commented select item are still there. promotion on `not_going` and on `group.leave`, plus a promotion email.
6. **public meetup teaser page** with og metadata (after 4, so it does not widen the leak).
7. **.ics download + google calendar link**, rsvp confirmation email, `SEQUENCE` on ics updates. `@laundryroom/calendar` has one consumer; `startInputType: "utc"` only works because the server runs utc.
8. **in-app notifications** — the `notification` table has zero references; revisit after reminders prove people read email.
9. **moderation queue** — manual statuses (`rejected/review/reported`) are no longer clobbered on edit, but nothing lets you review them; `User.role` is never read.
10. **meetup-scoped discussions** + next-day recap email.
11. **"your week" agenda** on the home page; meetup list stops at 50 upcoming (single-direction cursor).
12. **rate limiting on llm/email mutations** — better auth limits sign-in; `group.upsert`, `discussion.upsert`, `comment.createComment` still call openai synchronously and `group.join` emails the owner on every call.
13. pledge boards: delete the unused, out-of-sync `UpsertPledgeSchema` in schema.ts; nicer zod error messages in toasts.
14. i18n: the new `/login` and `/auth/confirm` pages and the magic-link email are english only; `id`, `vi`, `ko`, `he` catalogs still wait for proofreading; roadmap calls accessibility "a big one".
15. geo: address with lat/long and distance filter (roadmap).
16. mobile: `apps/expo` was deleted (template only). when it becomes real: re-scaffold with current expo sdk + `@better-auth/expo`.
17. tests: there are none. the curl smoke checks the gates ran (routes, auth endpoints, rate limit, image optimizer) would make a cheap `scripts/smoke.sh`; playwright for login later.

## dependencies and tech debt

- **remaining dependabot alerts (~69, all transitive, patch-level within majors):** undici (14), handlebars, js-yaml, nanoid, postcss, lodash, browserslist, brace-expansion, ip-address, tmp, turbo, drizzle-orm. → one commit of `pnpm.overrides` (as done for form-data/basic-ftp/handlebars) or `pnpm update -r --latest` on transitives, then the usual gate.
- peer-driven bumps that silence the last install warnings: typescript catalog `^5.6.3 → ^5.7.2` (trpc peer), `@tanstack/react-query` catalog `^5.51 → ^5.80` (trpc peer), drizzle-orm `0.36 → 0.45` (better-auth peer; adapter verified working on 0.36), `typescript-eslint` pinned to the stale `rc-v8` dist-tag → `^8` stable.
- majors left alone on purpose: tailwind 3 → 4 (shadcn migration), zod 3 → 4 (needs drizzle-zod ≥0.8, @hookform/resolvers 5), typescript 7, eslint 10, react-day-picker 8 → 10, sonner 2, lucide-react 1.x, openai 4 → 7 (check `@instructor-ai/instructor` first), resend 4 → 6, `@vercel/blob` 0.27 → 2 (moot if uploads move), dotenv-cli 7 → 11, @types/node 20 → 22 (match the image), next 16 (`proxy.ts`, turbopack default, cache components; next-intl already deprecates `requestLocale` in favour of `next/root-params`).
- react compiler: two advisory rules are off in `tooling/eslint/react.js` (`set-state-in-effect`, `immutability`), ten flagged sites listed there; `forwardRef` wrappers in packages/ui can be simplified when shadcn is re-synced; `tooling/eslint/types.d.ts` has stale react-hooks stubs.
- prettier prints `Ignored unknown option { __esModule / default }` for every file — the shared config is loaded through an esm/cjs interop wrapper; harmless but noisy.
- template leftovers: `LICENSE` still names the create-t3-turbo author; `.github/ISSUE_TEMPLATE/config.yml` links to t3-oss; root `postinstall` runs an unpinned `sherif@latest` (skipped in the docker build).

## done today, for reference

audit fixes (notifications that never sent, bans/ownership, pledge boards, share previews, capacity) · migration vercel/neon → dokku + postgres 18 · 236 junk accounts and 30k verification rows removed · better auth with scanner-proof magic links and rate limits · next 15.5 / react 19 / next-intl 4 · dependabot 275 → ~69, criticals 21 → 0.
