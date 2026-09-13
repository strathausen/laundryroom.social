# laundryroom on the at protocol — a plan

written 2026-09-13. this is the plan for turning laundryroom into a first-class at protocol (atproto) app: users sign in with their atproto identity, their groups, meetups and rsvps live as records in their own repos, laundryroom becomes an appview that indexes the network, and events made here show up in every other app that speaks the same lexicons — and vice versa. everything below was checked against primary sources in september 2026; links are at the end.

## tl;dr

- **it is a rewrite of the data layer and the identity layer, not of the product.** the pages, the ui, the trpc routers and most of the postgres schema survive as the "appview". what changes is where the truth lives (the user's pds, not our db) and who the user is (a did, not an email).
- **the wire format for meetups and rsvps already exists**: `community.lexicon.calendar.event` and `.rsvp`, used today by atmo.rsvp, openmeet, dandelion and the smoke signal archive. adopting them makes laundryroom interoperable on day one and costs nothing extra.
- **there is no group primitive on the protocol.** everyone (openmeet, atmo/contrail, roomy's arbiter, bluesky's own proposal) converges on the same answer: a group is its own atproto account (did + handle), whose keys the app custodies, and membership is a public two-way handshake between the group's repo and the member's repo. we do that under our own `social.laundryroom.*` namespace and propose it upstream.
- **private data is not there yet.** public repos are world-readable; "atproto spaces" (permissioned data) went alpha on 2026-08-20 with a launch "later this year", explicitly not for production. private/nsfw groups, member rosters you'd rather not publish, rsvp lists of private events, pledge details: these stay in our postgres exactly as today, behind a visibility flag, until spaces is stable. openmeet does the same.
- **smoke signal, the reference events app, was sunset in july 2026 and is now a read-only archive** that "links out to external services that implement the same lexicons for anything actionable". an actively maintained community-calendar appview is an open niche.
- **ingestion is a solved problem now**: bluesky ships `tap` (sync 1.1), a single container that does firehose connections, verification, backfill and collection filtering, and hands our worker json events over a websocket with acks. filtered to our collections it is a tiny workload for the falkenstein box.
- **sign-in is the hard part**, and it is well understood: a confidential oauth client (par + dpop + private_key_jwt, per-user pds discovery) using `@atproto/oauth-client-node`, sessions stored in postgres, our own cookie on top (better auth stays), plus a hosted signup path for people who have no atproto account yet.
- **sequencing**: identity first (no data changes), then read (index the network), then write (meetups + rsvps as records, dual-write, migrate existing data), then groups as dids, then hosted signup, then private groups when spaces ships. each phase ships on its own and is useful on its own. roughly three to four months of part-time work to the end of the groups phase.

## what "first class" means here

1. **your identity is your atproto identity.** profile urls are `/[handle]`; the did is the primary key everywhere; handle, name and avatar are a cache we re-verify. "sign in with bluesky" is the wrong copy — it is "sign in with your atproto account (bluesky, blacksky, self-hosted, or one we host for you)".
2. **your data lives in your repo.** meetups you organise, rsvps you give, groups you join, things you pledge to bring: records in your pds, signed by you, readable by any app. laundryroom is "just a view" (atmo's phrase) that can be replaced.
3. **records are interoperable, not just portable.** an event created in laundryroom appears in atmo.rsvp; an rsvp given in openmeet shows in the laundryroom attendee list. we use community lexicons wherever they exist and publish ours for the rest.
4. **the app can leave without taking anything.** "disconnect laundryroom" deletes our records from your repo and our index, never your identity. smoke signal's sunset is the precedent: end support, leave the records.
5. **public means public.** anything written to a repo is on the firehose forever-ish. the ui must say so at every write, and private things must not be written until the protocol can hold them.

## the constraints, as of september 2026

| topic | state | consequence for us |
|---|---|---|
| oauth for web apps | confidential client with client-metadata url, `private_key_jwt` (es256), par and dpop mandatory, per-user pds discovery; refresh tokens up to 180 days (bsky.social: 3-month refresh, 2-year session). granular scopes live (`repo:<nsid>?action=…`, `blob:image/*`, `rpc:…`, `include:<permission-set>`); `transition:generic` discouraged. permission-set resolution still flaky (issue #5508, sept 2026). | use `@atproto/oauth-client-node` 0.5.x as a backend-for-frontend; postgres state/session stores; `requestLock` from day one (web + worker can race the single-use refresh token); request granular scopes with a raw-scope fallback. |
| better auth | no atproto provider; two 0.1.0 community plugins, unmaintained-looking. | keep better auth for the cookie/session/user table; implement the atproto oauth stores against our own tables keyed by did; add a nullable unique `did` on `user`. |
| identity changes | handles change; dids move between pdses (migration keeps the did); `#identity` and `#account` events announce it; never cache did→pds across logins. | did-first schema; worker consumes identity/account events to refresh the cache and hide takendown/deleted accounts; render `handle.invalid` when verification fails. |
| event lexicon | `community.lexicon.calendar.event`: name, createdAt, description, startsAt, endsAt, mode, status, locations[] (address/fsq/geo/h3/uri), uris[], rsvpExpected. no image, no organiser/group, no capacity, no recurrence. `rsvp`: strongRef subject + interested/going/notgoing. | adopt as-is for the public core; put image, group link, capacity, pledge board in `social.laundryroom.*` sidecar records referencing the event; propose image/organiser/recurrence upstream on discourse.atmosphere.community. |
| group lexicon | none. bluesky's feb-2026 proposal: group = its own did/handle, membership = bidirectional public handshake, every community record carries a `space` (did) field. the arbiter (roomy) and contrail (atmo) implement group dids with vaulted credentials. | groups become dids we custody; `social.laundryroom.group.*` records; evaluate the arbiter/contrail before writing our own acl layer. |
| private data | "atproto spaces" alpha 2026-08-20: gated per-space repos on the author's pds, authority did, access control but no encryption, no relay (apps pull from pdses), alpha pds will be wiped, launch "later in 2026". critiques: no ownership transfer, space-type nsid lock-in. | keep private/unlisted content in postgres; design records so a private group later maps to "typed spaces under the group did"; no production use of the alpha. |
| ingestion | sync 1.1 + `tap` (dec 2025): single container, `TAP_COLLECTION_FILTERS`, `TAP_SIGNAL_COLLECTION` auto-tracks repos, backfills before releasing live events, websocket-with-acks (no cursor bookkeeping). jetstream v2 remains for casual use. | run tap as a dokku service next to postgres; our worker consumes it with `@atproto/tap`'s indexer. |
| writes | `@atproto/api` / new `@atproto/lex` client through the oauth session; bsky.social write budget 5,000 points/hour per did (create = 3), blobs ≤ 5 mib default upload cap, unreferenced blobs gc'd after ~1 h. | write from the next.js server; batch backfills with `applyWrites` under ~1,600 creates/hour/user; reference blobs in a record immediately. |
| custom reads | xrpc at `/xrpc/<nsid>`; pdses proxy authenticated calls to us via `atproto-proxy: did:web:laundryroom.social#…` with service-auth jwts. | serve public reads as xrpc + a `did:web` document; trpc stays internal for our own frontend. |
| notifications | no protocol primitive (open discussion since march 2026). | our worker reacts to indexed events and emails via resend — the pg-boss worker we planned anyway. |
| moderation | labels are generic; ozone self-hostable; small apps hide appview-side and honour existing labelers. | appview-side hiding + reports; llm moderation stays as an appview signal; revisit a labeler later. |
| ecosystem | ~41–46 m registered atproto accounts, ~10 m mobile mau (mid-2026, shrinking), bluesky pivoting to "atproto powers other apps"; independent pdses host tens of thousands of real people, so byo-pds users will be rare. openmeet, atmo.rsvp, dandelion, roomy, frontpage, leaflet, tangled are the live neighbours. | most users arrive from bsky.social; a hosted signup path for people without any account matters more than byo-pds polish. |

## target architecture

```
                 user's pds (bsky.social, blacksky, self-hosted, or ours)
                 ┌──────────────────────────────────────────────────┐
                 │ repo did:plc:alice                                │
                 │   community.lexicon.calendar.rsvp/…   (her rsvps)│
                 │   social.laundryroom.group.membership/… (joins)  │
                 │   social.laundryroom.pledge/…                    │
                 └───────────────▲──────────────────────────────────┘
        oauth (par/dpop) writes  │                    ▲ relay / sync 1.1
                                 │                    │
┌────────────────────────────────┴────────┐   ┌───────┴────────┐
│ laundryroom appview (dokku, falkenstein)│   │ tap (container)│  filtered to
│  web: next.js 15 (bff oauth client,     │◄──│ backfill+live  │  community.lexicon.calendar.*
│       xrpc + trpc, better auth cookie)  │   │ ws with acks   │  social.laundryroom.*
│  worker: pg-boss (indexer, email,       │   └────────────────┘
│       group-did writes, reminders)      │
│  postgres: index (at-uri, cid, did,     │        group repos (dids we custody)
│       record json) + private appview    │   ┌──────────────────────────────────┐
│       state (private groups, rosters,   │──►│ repo did:plc:group-xyz            │
│       oauth sessions, users, moderation)│   │   community.lexicon.calendar.event│
└─────────────────────────────────────────┘   │   social.laundryroom.group.profile│
                                              │   social.laundryroom.group.member │
                                              └──────────────────────────────────┘
```

three kinds of state, and the plan is mostly about deciding which bucket each thing goes in:

1. **records in user repos** — public, portable, interoperable. rsvps, memberships, pledges, comments (see mapping).
2. **records in group repos** — public, authored by the group did that we custody. the event itself (so admins can co-edit), the group profile, the member roster's group side.
3. **appview-only state** — everything private or operational: private/nsfw groups and their content, rosters of private groups, pledge quantities if the group is private, oauth sessions, moderation decisions, email preferences, notification bookkeeping, the search index.

## data model mapping

| today (postgres) | atproto record | repo | notes |
|---|---|---|---|
| `user` | (identity) + `social.laundryroom.actor.profile` (bio, pronouns, links) | user | `did` becomes the key; name/avatar cached from `app.bsky.actor.profile` or our profile record. keep `role`, `flags`, email prefs appview-side. |
| `group` (public) | `social.laundryroom.group.profile` (name, description, image blob, location text, status) | group did | the group is an account. `space` field = the group did on every group-scoped record. |
| `group` (private / nsfw) | — | appview | not published until spaces is stable; visible only to members via appview auth. |
| `group_member` | `social.laundryroom.group.member` (group side: did, role, since) + `social.laundryroom.group.membership` (user side: group did, since) | group + user | the bidirectional handshake. roles (owner/admin/member/banned): owner/admin live group-side; a ban is group-side only, never in the banned user's repo. |
| `meetup` | `community.lexicon.calendar.event` + `social.laundryroom.event.extras` (image blob, capacity, group ref, waitlist flag) | group did | authored by the group so any admin can edit. `status` maps 1:1 (active→scheduled, cancelled→cancelled, hidden→not published). deletion = `status: cancelled`, never delete (strongrefs would orphan). |
| `attendee` | `community.lexicon.calendar.rsvp` (strongRef to the event, going / notgoing / interested) | user | waitlist is appview-side (no rsvp status for it). |
| `discussion`, `comment` | `social.laundryroom.discussion.post` / `.reply` (or `community.lexicon.interaction.*` if it fits — check) | user | public groups only; private groups keep them in postgres. |
| `pledge_board`, `pledge` | `social.laundryroom.pledge.board` / `.item` | group did | board and needed items are the organiser's. |
| `pledge_fulfillment` | `social.laundryroom.pledge.fulfillment` (strongRef to item, quantity) | user | "i bring 4 drinks" is the member's record. |
| `group_promotion` | — | appview | operational. |
| `group_short_code` | — | appview | links resolve in our appview; consider `at://` deep links later. |
| `notification` | — | appview | derived from the index. |
| `session`, `account`, `verification` | better auth stays + `atp_oauth_state`, `atp_oauth_session` (did-keyed) | appview | |

things to keep in mind when writing the lexicons: new fields must be optional forever, required fields can never be removed, breaking changes need a new nsid; records should stay in the "few dozen kb" range; images are blobs referenced from a record (`accept: image/*`, `maxSize` ~2 mb to match bluesky practice).

## identity and onboarding

**sign-in with a handle (or did, or pds url).** the backend-for-frontend pattern the atproto docs recommend and leaflet/frontpage/smoke signal all use:

- serve `/oauth/client-metadata.json` (client_id = that url) and `/oauth/jwks.json`; es256 private jwk in dokku config.
- `@atproto/oauth-client-node` with drizzle-backed `stateStore` and `sessionStore` (two tables, json value, keyed by state / did) and a `requestLock` implemented as a postgres advisory lock — required because web and worker both refresh tokens.
- resolve handle → did → pds fresh on every login start (no did cache; migrated users otherwise get a redirect to a pds they left).
- on callback: verify `sub`, upsert `user` by did (create if new), create the better auth session as today. better auth remains the cookie layer; google and magic link stay as *legacy* providers during migration.
- scopes: `atproto account:email?action=read repo:community.lexicon.calendar.rsvp?action=create&action=update&action=delete repo:social.laundryroom.group.membership?… repo:social.laundryroom.pledge.fulfillment?… blob:image/*`, later collapsed into a published permission set `social.laundryroom.authFull` with the raw list as fallback while resolution is flaky.

**linking existing accounts.** the 18 real users (and future email signups) get a "connect your atproto account" button; on success we merge by did (leaflet's merge pattern), and from then on their new writes go to their repo. a one-off, throttled backfill publishes their existing rsvps/memberships/pledges (applyWrites, well under 1,600 creates/hour). the ui asks before publishing anything that was created while private.

**hosted signup for people with no account.** most local meetup members will not have an atproto account. two options:

1. *run our own pds* (`pds.laundryroom.social` or a separate handle domain like `*.lndry.me` — openmeet learned to keep handles off the app domain because of wildcard-dns and cookie collisions). start oauth against it with `prompt=create` so the user gets a real account with a real handle during login. the reference pds supports account creation inside the oauth flow since may 2025; the spring-2026 roadmap adds pds-side email/password management and signup templates. cost: one more dokku app (the pds image), smtp for its emails, ~5–10 mb storage per active user, and openmeet's list of gotchas (invite codes, plc env, dev records leaking to prod).
2. *custodial accounts* the openmeet way (random password in our db, "take ownership" later). simpler to start, worse story, and bluesky discourages apps calling `createAccount` with user passwords.

recommendation: option 1, as phase 5, once the protocol side is proven with bring-your-own-account users. until then, email/google users stay appview-only (openmeet's hybrid), which also keeps the door open for people who never want an atproto identity.

**account deletion.** "delete my laundryroom account" = delete every `social.laundryroom.*` and calendar record we wrote to your repo (with your oauth grant), purge our index and appview state, revoke sessions; never touch the identity. the indexer must honour `#account` events: deactivated/suspended → hide, deleted/takendown → purge.

## groups as dids

a record is signed by its author, so "admins can edit the group's events" needs a shared author. the group is that author.

- creating a group creates an account on our pds (`<slug>.groups.laundryroom.social`, did:plc), whose signing key and session we custody in the appview (encrypted with `AUTH_SECRET`-style key management; rotate to a kms later). every write on behalf of the group is authorised by an appview-side role check (owner/admin), then performed with the group's credentials from the worker.
- membership handshake: user writes `membership` pointing at the group did; group writes `member` with the role; the appview shows membership only when both sides exist (or, for an invite, when the group side exists and the user accepts).
- roles, bans, ownership transfer are group-side records — and stay appview-side too for private groups.
- before building this, evaluate two existing implementations: **the arbiter** (roomy/muni town: community dids, spaces, roles, delegated membership, invites, an xrpc membership api; ga july 2026) and **contrail** (flo-bit: appview framework with communities as group-controlled dids, acls, credential vaulting). adopting one buys interop with roomy/atmo and saves a month; the risk is coupling to a young project. decide in phase 4 with a two-day spike.
- the `space` field (did of the group) on every group-scoped record is cheap now and is exactly what spaces will want later.

## private data strategy

- today's private/nsfw groups keep working unchanged: nothing about them is written to any repo. member-only pages, rosters, discussions and pledges of private groups are served from postgres to authenticated members, exactly as now.
- the ui gets one honest switch per group: *public on the network* vs *private (laundryroom only)*, with "public cannot be made private again" spelled out (bluesky's own model: "either public or not"). converting private → public later is delete-and-recreate, which is fine for groups with little history.
- spaces watch-list: ownership transfer, member-list privacy, space-type portability, and whether an appview needs per-space credentials to index member-only records. when spaces is ga and those are answered, private groups become "typed spaces under the group did" and the appview-only tables shrink to operational state.

## ingestion and indexing

- `tap` as a dokku service (`ghcr.io/bluesky-social/indigo/tap`, postgres backend via `TAP_DATABASE_URL` — or its default sqlite on a persistent volume), `TAP_COLLECTION_FILTERS=social.laundryroom.*,community.lexicon.calendar.*`, `TAP_SIGNAL_COLLECTION=social.laundryroom.actor.profile` so every laundryroom user's repo is tracked automatically, backfilled before live events.
- the worker (pg-boss process) consumes tap over websocket-with-acks; handlers are idempotent on at-uri; `create/update/delete` upsert or remove index rows; `identity`/`account` events refresh the did cache and hide content; `live: false` events are backfill.
- index tables: `record(uri pk, cid, did, collection, rkey, indexed_at, json)` plus typed projections for events, rsvps, memberships. dangling strongrefs are tolerated (rsvp before we saw the event) and resolved lazily.
- we also index *other apps'* events in the calendar collections. product decision: show "nearby events from the network" as a discovery feed (smoke signal's role), clearly separated from laundryroom groups.
- backfill of our own existing data happens as a one-off worker job per linked user/group (see identity), not through tap.
- resource envelope: a filtered subscription is tens of mb/day; tap's sql store is uncompressed but our collections are tiny; the falkenstein box has 25 gb ram and 265 gb disk free.

## api surface

- public reads become xrpc under `/xrpc/social.laundryroom.*` (`getGroup`, `listGroupEvents`, `getEventView` with attendee counts, …) served by next.js route handlers; publish a `did:web:laundryroom.social` document declaring the appview service so pdses can proxy authenticated calls with service-auth jwts (`iss` = user did, `aud` = our did, `lxm` = method).
- trpc stays as the internal api of our own frontend; over time its read procedures delegate to the same code as the xrpc handlers.
- `.ics` per event and per group, and og cards, stay (smoke signal and atmo both ship them; they are how events spread on bluesky).

## images

- uploads move from vercel blob to the user's/group's pds via the oauth `blob:image/*` scope: upload → reference in the record within the hour → done. the pds serves the bytes; we run a small image proxy/cdn keyed by `did+cid` (resize, cache) because there is no shared cdn for third-party apps (cdn.bsky.app is bluesky's).
- migration: existing group/user images are re-uploaded to the owning repo during the backfill job; the vercel blob token can then be retired (an open task anyway).

## phases

each phase deploys on its own and is useful on its own. estimates are for one person part-time and assume the worker/pg-boss foundation from the open-tasks list exists first.

**phase 0 — foundations (1–2 weeks).** worker process + pg-boss (already planned); draft the `social.laundryroom.*` lexicons as json in `packages/lexicons` and generate types with `@atproto/lex`; register `_lexicon.laundryroom.social` txt → a laundryroom-owned did and publish the schemas with `goat lex publish`; `did:web:laundryroom.social` document; decide the handle domain for hosted accounts.

**phase 1 — identity (2 weeks).** oauth bff with `@atproto/oauth-client-node`, postgres stores, advisory-lock `requestLock`, client metadata + jwks endpoints, "sign in with your atproto account" on `/login` next to the legacy providers, "connect your account" for existing users, did column on `user`, handle-based profile urls. no data leaves postgres yet. exit criterion: you and one friend sign in from bsky.social and from a different pds; a handle change and a pds migration are handled without lockout.

**phase 2 — read the network (1 week).** tap as a dokku service, the indexer job in the worker, index tables, identity/account handling, a "events from the network" discovery page and cross-app links on event pages ("also on atmo.rsvp"). exit criterion: an event created on atmo.rsvp by a linked user appears in laundryroom within seconds, and disappears when cancelled.

**phase 3 — write meetups and rsvps (2–3 weeks).** rsvps become `community.lexicon.calendar.rsvp` records in the member's repo (dual-write: repo + postgres until the index is trusted); meetups of *public* groups become `calendar.event` + `event.extras` records — authored by the group did if phase 4 is done, else by the organiser's did as a stopgap (organiser-only edits, exactly like atmo today); one-off backfill of existing public data with consent; email reminders/notifications now driven by the index. exit criterion: an rsvp given in openmeet shows in the laundryroom attendee list and vice versa; write budget respected during backfill.

**phase 4 — groups as dids (3–4 weeks).** the arbiter/contrail spike and decision; group accounts on our pds, custodied credentials, group-side writes from the worker, membership handshake, roles/bans, `space` on every record, pledge boards as records, discussions for public groups; propose the group and pledge lexicons at lexicon community. exit criterion: two admins co-edit a group's event; a member leaves and the roster updates everywhere; a group that goes public later is re-published cleanly.

**phase 5 — hosted signup (2 weeks + ops).** our pds with `prompt=create`, handle domain, smtp, invite-code policy, spam gating for brand-new accounts (no group creation on day one), signup copy that explains what an atproto account is. google/magic-link become the pds's own signup ux or are retired. exit criterion: a person with no account gets from a qr code to "going" in under two minutes on a phone.

**phase 6 — private groups on spaces (when ga, est. 2027).** re-evaluate against the watch-list; move private group content into typed spaces under the group did; shrink appview-only state.

**phase 7 — cleanup.** retire vercel blob, legacy auth providers, trpc read paths that duplicate xrpc.

## risks and how we hold them

- **oauth edge cases** (pds offline at login, permission-set resolution failures, older self-hosted pdses rejecting unknown scopes): raw-scope fallback, clear error pages, keep the legacy providers until phase 5 has run for a while.
- **write budget and spam**: 5,000 points/hour per did is plenty for humans and too little for careless backfills; throttle jobs, gate group creation for new accounts, keep the llm moderation as an appview signal and add reports.
- **public-by-default surprises**: every write ui states "this will be public on the network"; private stays private by construction (never written).
- **coupling to young projects** (tap is official; the arbiter/contrail/quickslice are community): use tap; time-box the arbiter/contrail evaluation and keep our own group-did layer small enough to own.
- **ecosystem drift**: lexicon community moved to tangled and archived github in july 2026; smoke signal sunset; bluesky's mau shrinking while the protocol grows. the bet is on the protocol, not on bluesky the app; the design above works with any pds.
- **two parallel systems** (public records vs private appview state) is a real cost that spaces is meant to remove; keep the private path minimal and identical to today's behaviour so it does not grow.

## decisions needed from you

1. **handle domain** for hosted accounts and group accounts (e.g. `*.lndry.me`, `*.groups.laundryroom.social`) — separate from the app domain per openmeet's lessons.
2. **network discovery feed** — do we show other apps' events (smoke signal's role) or only laundryroom groups' events?
3. **legacy providers** — keep email/google as a permanent "laundryroom-only" tier (openmeet does) or sunset them after phase 5?
4. **group primitive** — build our own minimal group-did layer, or adopt the arbiter/contrail if the phase-4 spike is convincing?
5. **what to propose upstream** — event images/organiser/recurrence to lexicon community, and the group/membership lexicon; someone has to show up to their monthly meeting.
6. **name for the namespace** — `social.laundryroom.*` assumes `laundryroom.social` stays the canonical domain.

## open questions still to verify at implementation time

- whether bsky.social honours third-party `include:` permission sets reliably yet (issue #5508); until then ship raw scopes.
- the exact `prompt=create` behaviour of the current reference pds and whether invite codes are still required.
- whether spaces will support ownership transfer and private member lists before ga.
- whether smoke signal has a successor with write support and a public xrpc event index (its discourse was unreachable).
- whether `community.lexicon.interaction.*` fits discussions/comments or we need our own.
- per-account repo size/record-count quotas on bsky.social for group accounts holding many events.

## sources

- oauth spec and patterns: https://atproto.com/specs/oauth · https://atproto.com/guides/oauth-patterns · https://atproto.com/blog/oauth-improvements · https://atproto.com/specs/permission · https://github.com/bluesky-social/atproto/issues/5508
- oauth-client-node and real implementations: https://github.com/bluesky-social/atproto/blob/main/packages/oauth/oauth-client-node/README.md · leaflet `src/atproto-oauth.ts` (hyperlink-academy/leaflet) · frontpage `apps/frontpage/lib/auth.ts` (likeandscribe/frontpage) · https://github.com/AugusDogus/atproto-better-auth
- identity lifecycle: https://atproto.com/specs/handle · https://atproto.com/specs/sync · https://atproto.com/guides/account-lifecycle · https://atproto.com/specs/account
- rate limits: https://bsky.network/docs/rate-limits/ · https://docs.bsky.app/docs/advanced-guides/rate-limits
- lexicons: https://lexicon.community/ · https://tangled.org/lexicon.community/lexicons · https://atproto.com/guides/publishing-lexicons · https://atproto.com/specs/lexicon · https://atproto.com/guides/data-validation · https://atproto.com/specs/blob
- smoke signal: https://tangled.org/smokesignal.events/smokesignal · https://blog.smokesignal.events/posts/3lthgjbbhyk2c-community-lexicons · https://blog.smokesignal.events/posts/3lvbownlrme2a-atprotocol-record-references-authoritative-vs-unauthoritative-patterns
- openmeet, atmo, contrail: https://openmeet.net/your-identity-your-events · https://openmeet.net/running-a-pds-for-your-app · https://openmeet.net/cross-app-authentication-atproto · https://github.com/flo-bit/atmo-events · https://github.com/flo-bit/atmo-events/issues/78
- groups and private data: https://bnewbold.leaflet.pub/3me3ea64bhk26 · https://atproto.com/blog/atproto-spaces-alpha · https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data · https://zicklag.leaflet.pub/3mjrvb5pul224 · https://meri.leaflet.pub/3mj4qwvypq22a · https://github.com/bluesky-social/atproto/discussions/3363
- ingestion and appviews: https://atproto.com/blog/2026-spring-roadmap · https://github.com/bluesky-social/indigo/blob/main/cmd/tap/README.md · https://github.com/bluesky-social/atproto/blob/main/packages/tap/README.md · https://bsky.network/docs/jetstream/ · https://atproto.com/guides/statusphere-tutorial · https://atproto.com/specs/xrpc · https://github.com/bluesky-social/atproto/discussions/2961 · https://github.com/bluesky-social/atproto/discussions/4795 · https://atproto.com/specs/label · https://marvins-guide.leaflet.pub/3m7ttuppfzc23 · https://updates.microcosm.blue/3mik73ajygk2m
- hosted signup: https://atproto.com/blog/network-account-management · https://atproto.com/guides/self-hosting
- ecosystem: https://techcrunch.com/2026/08/11/blueskys-active-user-base-is-shrinking-as-its-focus-expands-beyond-the-app/ · https://sifa.id/stats · https://courier.social/
