# laundryroom on the at protocol — the fully native plan

written 2026-10-03, revised the same day after the owner's decisions (see "decisions made", 7–11). replaces the hybrid plan of 2026-09-13. since that plan, two things changed. first, laundryroom becomes a **fully native** atproto app. second, the owner accepts experimental features (the atproto spaces alpha for private data, the opensocial.group draft for groups) in order to test them while they settle, and runs laundryroom's own pdses on the spaces alpha now.

every fact below was checked between 2026-10-01 and 2026-10-03 against source code, package registries, container registries or primary posts. research notes and clones are in `/private/tmp/claude-501/{atproto-spaces,grouphost-research,opensocial-research,atproto-research}`. anything not verified is marked *unverified*. sources are at the end.

## tl;dr

- **fully native means three things.** every piece of content is a record authored by a did. our postgres is only an index plus operational state, and could be rebuilt from the network (local records, below, are the one exception). nobody signs in with an email or google any more. public things are records in public repos; members-only things are records in atproto spaces.
- **there are two pds instances on falkenstein, both on the spaces alpha.**
  - `pds.lndry.me` hosts people (`alice.lndry.me`).
  - `pds.lndry.social` hosts group accounts (`foodiespace.lndry.social`).
  - both run the pinned alpha image `ghcr.io/bluesky-social/atproto:pds-79d6307e19908f3af406838ea0e5fae42847f182` (@atproto/pds 0.5.32). the reason, plainly: the owner accepted experimental features in order to test them while they settle; laundryroom has ~18 accounts and no outside users; and one stack is much less ops for a solo developer than a parallel testbed. there is no separate testbed.
  - each is its own dokku app with its own wildcard cert, admin password and relay budget. laundryroom holds the group accounts' credentials, never the people's.
- **spaces is alpha and breaks every week, so real data sits behind guardrails.**
  - releases come on thursdays. the 2026-10-01 release swapped dpop for http message signatures, and a repo serialization change is announced for about 2026-10-08..15.
  - lndry.me sign-up is invite-only (a pre-minted single-use pool) for the whole alpha, so only testers get accounts.
  - members-only features are labelled "alpha" in the ui.
  - backups exist before the first non-owner account, and every group did carries laundryroom's offline group-recovery key.
  - a thursday routine takes a backup, then bumps the pinned image and the alpha npm versions together.
  - contract tests run against a local multi-pds dev env at the pinned commit. cross-pds checks use one developer account on bluesky's hosted alpha pds.
- **members without spaces still take part.** bsky.social and most other pdses have no spaces yet. those members' members-only records are kept as **local records** in our index: the same lexicon shape, author = their did, `source = local`, never published. they are lifted into the member's own space repo once their pds supports spaces. the ui says where each post is stored.
- **at ga, accounts move.** an alpha volume probably won't boot a production image (a migration-name clash, see below). so at ga we stand up fresh ga pdses and move the accounts with standard atproto account migration, in one short maintenance window per pds. space data has no import path, so it is re-created from our index. the whole move is rehearsed on a restored backup first.
- **groups.**
  - each group is a did:plc account on `pds.lndry.social`. laundryroom holds an app password for it, plus the master password for spaces sync, encrypted.
  - group data is shaped like the opensocial.group draft (`group.opensocial.*` at commit `d2c89a9`). it is written into **simplespaces**, the access model the reference pds actually enforces today.
  - roles, join requests and bans are enforced by the appview, as the draft itself says apps must.
  - nobody runs an opensocial "group host" yet, and bluesky's prototype is unpublished. a `GroupHost` interface keeps a later move local.
- **meetups.**
  - a meetup is a `community.lexicon.calendar.event` authored by the group did. the canonical copy lives in the group's calendar space.
  - for active groups, a public mirror sits in the group's public repo, so atmo.rsvp, openmeet and logged-out visitors can see it.
  - an rsvp is a `community.lexicon.calendar.rsvp` in the member's own space repo (a local record if their pds has no spaces). it is members-only by default and public only on opt-in, because attendee names are member content today.
- **sign-in.**
  - only atproto oauth: a confidential client with `@atproto/oauth-client-node` 0.5.9.
  - better auth stays as the cookie layer, through a ~150-line in-repo plugin.
  - "create a lndry.me account" is `prompt=create`, using a single-use invite from a pool we mint in advance. during the alpha, invites go to testers only.
  - email comes through `account:email?action=read`.
  - the ~18 existing users link a did to their account during a 4-week window. after that, google and magic links go.
- **no new leaks.** the access matrix in `packages/api/src/access.ts` (written 2026-10-03 with the leak fixes) is the spec for three things: what may become public, what goes into which space, and what the appview serves to whom. the section "no new leaks" lists the leak paths that only exist on the native side: group handles, public mirrors, rsvps, space blobs, sync credentials, removed members, local records, and the backups that now hold members-only data.
- **order of work.** groundwork, the pdses, atproto login, group accounts, public meetups, spaces-backed discussions in production, everything else on spaces, the ga move, and cleanup.
  - atproto login can start before the pdses exist, with bsky.social accounts.
  - real users first see something native at phase 2 (login).
  - interop with other apps starts at phase 4.
  - members-only content starts moving onto spaces (and local records) at phase 5.
  - it is roughly 4 months part-time. if spaces ga ships before phase 5, the ga move comes first, while the spaces hold little data.

## what changed since the 2026-09-13 plan

| the old plan said | as of 2026-10-03 |
|---|---|
| hybrid: email/google stay as a permanent tier; private data stays in postgres until spaces ships | fully native target. legacy sign-in is retired after a linking window. private data goes onto spaces on our own alpha-image pdses from phase 5, behind guardrails; members whose pds has no spaces get local records. at ga, the accounts move to fresh ga pdses. |
| group membership is a public two-way handshake (`social.laundryroom.group.member` + `.membership`) | **dropped.** it publishes rosters, which leaks what today's access rules hide, and it diverges from the ecosystem draft, where membership records live inside the group's members space. |
| spaces launch "later in 2026"; phase 6 "est. 2027" | alpha since 2026-08-20, with weekly breaking releases. october is an iteration, informal ga is targeted for november 2026, december is polish. bluesky asks apps not to *publicly launch* production features on spaces before ga; work labelled alpha is fine. |
| permission-set resolution is flaky (issue #5508) | #5508 was closed on 2026-09-18 by its reporter because it could no longer be reproduced; no fix is linked. if resolution fails, the whole par still fails with `invalid_scope`, so the raw-scope fallback stays. |
| everything collapses into `social.laundryroom.authFull` | a set's `repo:` and `rpc:` permissions must stay inside `social.laundryroom.*`. `community.lexicon.*`, `blob:` and `account:` are requested raw. on the alpha only, `space` permissions in a set may list foreign collections, because only the space *type* is authority-checked. |
| the arbiter went "ga july 2026" | it is experimental. last push 2026-09-19, no spaces code. |
| contrail is a candidate group layer | its spaces pr #95 shows merged at 2026-09-14t01:27z but was force-pushed out of main at 01:29z. the code lives on `feat/spaces-alpha-v1` as a private package and uses the pre-10-01 dpop protocol. |
| a `did:web:laundryroom.social` document | does not resolve today: the apex 301s to www, and every atproto did:web resolver fetches with `redirect: 'error'`. `https://www.laundryroom.social/.well-known/did.json` is a 404. |
| our own pds has no particular limits | the bsky.network relay caps a new pds host at 100 accounts, 50 events/s, 2,600 events/h and 21,000/day, per hostname, and raises limits on request. every group is an account. |
| handle domain undecided (`*.groups.laundryroom.social`) | `lndry.me` for people, `lndry.social` for groups. handle labels are 3–18 characters, a single label, and not one of ~1,030 reserved names. |
| `calendar.event` has `rsvpExpected` | it is in the lexicon repo (91c50cb) but not in the published schema. |
| tap is "the" ingestion answer | still true, but the newest image (`0.1.10`) is from 2026-03-11. the september hardening (ssrf-safe car fetches, identity-directory fixes) exists only in source. |
| the box has 25 gb ram | 16 vcpu, ~30 gb ram, ~265 gb free disk, dokku 0.37.6, dokku-letsencrypt 0.20.4 |

## what "fully native" means here

1. **your identity is your atproto identity.** sign-in is atproto oauth only. people without an account get a real one on lndry.me during sign-in. the did is the primary key everywhere. handles, names and avatars are a cache we re-verify. the login copy is "sign in with your atproto account (bluesky, lndry.me, self-hosted, …)", not "sign in with bluesky".
2. **every piece of content is a record with an author.**
   - rsvps, pledges, posts and replies are records of the member.
   - meetups, pledge boards, the group profile, roles and memberships are records of the group's did.
   - public content sits in public repos; members-only content sits in spaces, or, for members whose pds has no spaces yet, in local records waiting to be lifted.
3. **postgres is an index plus operational state.** operational state means oauth sessions, custodied group credentials, join requests, notification bookkeeping, search text, promotions and short codes.
   - the test: drop the index tables, re-sync from the network, and the app looks the same.
   - local records are the one exception. they exist only in our index until they are lifted, so the test keeps `source = local` rows, and laundryroom-db backups cover them.
   - until a feature moves onto spaces (phase 5 for discussions, phase 6 for the rest), its content stays in today's postgres tables, and production cannot pass the test for it.
4. **records interoperate.**
   - meetups and rsvps use `community.lexicon.calendar.*` unchanged.
   - groups are opensocial-shaped, so a future group host or another groups app can read them.
   - laundryroom-only concepts (pledges, capacity, the discussion board) use `social.laundryroom.*`, published.
5. **the app can leave without taking anything.** "disconnect laundryroom" deletes our records from your repo and our index. it never touches your identity.
6. **public means public; private means space; nothing is wider than the group's setting.** the appview enforces `access.ts` over its index. a public record is only ever written when `access.ts` says anonymous visitors may see that thing.

## decisions

### made (2026-10-03)

1. **fully native.** no permanent email/google tier, no permanent postgres-only private data.
2. **experimental features accepted**: the spaces alpha for private data, and the opensocial.group draft for the group model. they are accepted *in order to test them while they settle*. real members' data goes onto them now, inside the guardrails of decision 8.
3. **lndry.me** is the user pds and handle domain (`alice.lndry.me`). **lndry.social** is the group account domain (`<slug>.lndry.social`).
4. **the pdses run on the dokku box** (falkenstein, hetzner fsn1, 167.235.249.248).
5. **both domains are bought through vercel under the `thefoodiespace` team.** the owner has to do this: vercel refuses purchases made by agents (`purchase_requires_user`). the command is `vercel domains buy lndry.me --scope thefoodiespace`, and the same for `lndry.social`. dns for both stays on vercel dns.
6. **the leaks are fixed first** (`access.ts`, the `pending` member role, join requests for private groups; committed 2026-10-03, production deploy waiting for the owner). that access matrix is the publishing and enforcement spec for everything below.
7. **both real pdses run the pinned spaces alpha image** (was open decision 1; option a).
   - `pds-me` (pds.lndry.me, people) and `pds-social` (pds.lndry.social, group accounts) run `ghcr.io/bluesky-social/atproto:pds-79d6307e19908f3af406838ea0e5fae42847f182`: @atproto/pds 0.5.32, amd64 only, runs as `USER node` (uid 1000), no distro wrapper, no goat inside.
   - why: the owner accepted experimental features in order to test them while they settle. laundryroom has ~18 accounts and no outside users. one stack is much less ops for a solo developer than a parallel testbed.
   - so there is **no separate testbed**: no pds-alpha, no alpha.lndry.social, no laundryroom-alpha app, db, oauth client or did, no tap-alpha, and no `ATPROTO_SPACES` switch between environments.
   - contract tests run against a local `pnpm --filter @atproto/dev-env start:multi-pds` at the pinned `permissioned-data-alpha` commit. cross-pds checks use one developer account on bluesky's hosted alpha pds. the fixtures and the seed script are for local dev and contract tests only.
8. **guardrails instead of "never real data in the alpha"** (details under "containing the alpha"):
   - lndry.me sign-up stays invite-only, from the pre-minted single-use pool, for the whole alpha (this settles the old open decision 3), so only testers get accounts;
   - members-only features are labelled "alpha" in the ui;
   - backups exist before the first non-owner account: on-box every 6 h with rotation until hetzner object storage credentials exist, then restic offsite;
   - group dids get laundryroom's offline group-recovery key (`PDS_RECOVERY_DID_KEY` on pds-social only, never on pds-me);
   - a weekly thursday routine bumps the pinned image and the alpha npm versions together, backup first.
9. **the ga path is a move, not an upgrade** (details in phase 7). at ga we stand up fresh ga pdses and move the accounts with standard atproto account migration. space data is re-created from the index. the whole move is rehearsed on a restored backup first.
10. **members whose pds has no spaces take part through local records** (was open decision 9; decided now, not at ga). their members-only records live in our index with `source = local` and are lifted into their own space repo once their pds supports spaces. the rule "joining requires a spaces-capable pds" is gone.
11. **tls bootstrap from the owner's laptop.** phase 1 does not wait for open decision 4. the two wildcard certs (apex + `*` each) are issued with lego's vercel dns provider on the laptop and installed with `dokku certs:add`. it is a stopgap: renewed by hand before day 60, and replaced before let's encrypt shortens lifetimes to 64 days on 2027-02-10.

### still open (with a recommendation)

| # | decision | options | recommendation | decide by |
|---|---|---|---|---|
| 1 | the ~18 existing google/magic-link users | link a did to the existing user row; or a fresh start | **link**, with a 4-week window and then legacy sign-in is removed. it is cheap with 18 people, and foodiespace keeps its history. | phase 2 |
| 2 | rsvps of active groups | public records (best interop); members-only space records; members-only plus an opt-in public copy | **members-only by default, opt-in public copy.** attendee names are member content in `access.ts`; publishing them would undo a leak fix. | phase 4 |
| 3 | handles of non-public groups | descriptive (`secretclub.lndry.social`); opaque (`g-7f3kq2.lndry.social`) | **opaque for hidden/private/nsfw/archived, descriptive for active.** handles are public on plc and the relay, and the plc audit log keeps old ones forever. | phase 3 |
| 4 | dns-01 credentials on the box (to replace the laptop stopgap) | a `thefoodiespace` vercel token; a dedicated vercel team for the two domains with a team token; cname-delegating `_acme-challenge` to desec with a token that can only write that txt; acme-dns on the box (joohoi/acme-dns + lego's `acme-dns` provider; needs port 53 and an ns delegation for e.g. `acme.lndry.social`; no dns-provider credential anywhere) | **desec delegation**: no service to run, and the token can only write one txt name. never the thefoodiespace token on the box: it could rewrite laundryroom.social's mx (proton) and a records. acme-dns if no third party should be involved, at the cost of one more service and an open port 53. the dedicated team is last. | before the stopgap's first renewal (day 60); at the latest 2027-02-10 |
| 5 | the appview's did | `did:web:laundryroom.social` (needs an exemption from the apex redirect); `did:web:www.laundryroom.social` (no infra change) | **`did:web:laundryroom.social`**, exempting `/.well-known/` from the 301. decide before the first `registerNotify` or `rpc:` scope, because the did is baked into both. | phase 0 |
| 6 | group host | wrap pds.lndry.social into our own opensocial group host (nested oauth, the 24 `group.opensocial.*` methods, createGroup); wait for bluesky's or a community one | **wait.** keep `LocalPdsGroupHost` behind the `GroupHost` interface. other apps can read our groups but not manage them. | revisit at ga |
| 7 | a network discovery feed (other apps' events) | show it; only laundryroom groups | carried over from the old plan, still open. tap's signal collection is set accordingly. | phase 4 |
| 8 | upstream | weigh in on the naming thread (discourse 1268); file issues | **do both.** file issues for profile location/time zone, public-repo grants, ban semantics, anonymous read of public spaces, and a shared calendar space type. propose a community calendar space type at lexicon.community. | ongoing |

## target architecture

```
              falkenstein · dokku 0.37.6 · nginx owns :80/:443 · wildcard certs (laptop stopgap)
 ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                               │
 │  pds-me        ghcr.io/bluesky-social/atproto:pds-79d6307e… (spaces alpha, pds 0.5.32)        │
 │                pds.lndry.me · *.lndry.me        people (testers, invite-only): alice.lndry.me │
 │                oauth authorization server for people · prompt=create · invites from a pool    │
 │                public repos · members' space repos                                            │
 │                                                                                               │
 │  pds-social    the same pinned image                                                          │
 │                pds.lndry.social · *.lndry.social   groups: foodiespace.lndry.social           │
 │                group accounts, credentials held by laundryroom · the lexicon account          │
 │                public repo (profile, mirrors) · space host for every group space              │
 │                                                                                               │
 │  laundryroom   web:    next.js 15 · ui · trpc · better auth + atproto oauth bff               │
 │                        /xrpc/* · /.well-known/did.json · space notify receiver · image proxy  │
 │                worker: pg-boss · tap · space syncer · group writer · lifter · email · llm     │
 │  laundryroom-db  postgres 18 · record index (repo, space, local) + appview state              │
 │  tap           ghcr.io/bluesky-social/indigo/tap:0.1.10 · own postgres db (tap-db)            │
 │  backups       every 6 h · both pds volumes + laundryroom-db · on-box now, restic later       │
 │                                                                                               │
 │  ── at ga (phase 7): fresh ga pdses, accounts moved, space data re-created from the index ──  │
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
      ▲ crawl (pds-me, pds-social)       ▲ oauth, xrpc                 ▲ notifyWrite, getSpaceCredential
  bsky.network relay · plc.directory   other pdses (bsky.social, …)   bluesky's hosted alpha pds (one dev account)
                                       other appviews (atmo.rsvp, openmeet, grain)
```

### the two pds instances

| app | image | hostname / handle domain | holds | laundryroom has | relay | backups |
|---|---|---|---|---|---|---|
| `pds-me` | `ghcr.io/bluesky-social/atproto:pds-79d6307e19908f3af406838ea0e5fae42847f182` (= `pds-spaces-alpha` on 2026-10-01; @atproto/pds 0.5.32; amd64 only; `USER node`, uid 1000; the monorepo's `services/pds` build, so no distro wrapper and no goat inside) | `pds.lndry.me`, `.lndry.me` (apex + `*`) | people; testers only during the alpha (invite-only) | nothing beyond each user's oauth grant; **no admin password** | crawled (`PDS_CRAWLERS=https://bsky.network`) | every 6 h (on-box with rotation, later restic offsite) + offline keys |
| `pds-social` | same | `pds.lndry.social`, `.lndry.social` (apex + `*`) | group accounts, the `laundryroom.social` lexicon account | admin password, group app passwords + master passwords (encrypted) | crawled | every 6 h + offline keys; every group did also carries the offline group-recovery key |

why two apps instead of one pds with two handle domains:
- with more than one handle domain, the oauth sign-up ui (`handle-field.tsx`) shows a "select domain" radio, so people could squat `*.lndry.social` names.
- the relay budget (100 accounts, 2,600 events/h) is per hostname, so two hosts get two budgets.
- laundryroom gets admin on the group pds only, never on the pds that holds people's identities.

`pds` is a reserved handle label, so no account can take the hostname.

cross-pds behaviour is exercised in production itself: a lndry.me member writing into a foodiespace space goes from pds-me to pds-social through `notifyWrite`, a real pds-to-pds hop. one developer account on bluesky's hosted alpha pds (`spaces-alpha.host.bsky.network`, invite from bsky.network/account) checks a pds we don't run; bluesky asks that no non-developer users be pointed at that one. the contract tests use the local multi-pds dev env.

### the appview

- **web** (next.js 15, the existing app). it serves:
  - the ui and trpc;
  - better auth with the atproto plugin;
  - `/oauth-client-metadata.json` and `/oauth/jwks.json`;
  - `/.well-known/did.json`;
  - `/xrpc/[nsid]`, which includes the spaces notify receiver;
  - `/img/<preset>/<did>/<cid>`.

  every read comes from the index; nothing is fetched from a pds per request.
- **worker** (pg-boss; `Procfile` gets `worker: node packages/worker/dist/index.js` or similar). it runs:
  - the tap consumer (public records, identity/account events);
  - the space syncer (catch-up per space, plus jobs triggered by notifications);
  - the group writer (every write as a group goes through one job type, after the access check in trpc);
  - the lifter (local records into members' space repos, once their pds can hold them);
  - email, reminders and llm moderation.
- **tap**: a separate dokku app with its own postgres service. it is rebuildable, so it needs no backup.
- **postgres** (`laundryroom-db`). it holds:
  - the record index: `record(uri pk, cid, did, collection, rkey, space nullable, source, json, indexed_at)`, where `source` is `repo` (public), `space` or `local` (see "local records"), plus typed projections for groups, events, rsvps, threads, replies, pledges;
  - better auth tables;
  - `atproto_oauth_state` and `atproto_oauth_session`;
  - `group_credential`, `group_space`, `space_sync`, `space_repo`;
  - `join_request`, `group_ban`, `invite_code`, `service_auth_nonce`;
  - notifications, promotions, short codes, search text.

### spaces flows

a members-only post by a member on a spaces-capable pds, end to end (production from phase 5). a member without spaces takes the local-record path instead (see "local records"):

```
 alice (pds-me)                   foodiespace (pds-social)                      laundryroom
                                                                         0. trpc: access.ts says alice is an
                                                                            active member, not banned
 1. com.atproto.space.createRecord  ◄────────── oauth session (alice) ─────  web
    space = at://<groupDid>/space/social.laundryroom.forum/self
    repo = alice · collection social.laundryroom.forum.thread
                                                                         1b. optimistic index row (uri, cid)
 2. alice's pds ── notifyWrite {space, repo, repoRev, hash} ──►
                                  3. space host checks write policy,
                                     assigns a strictly increasing spaceRev
                                  4. ── notifyWrite {…, spaceRev, prevSpaceRev} ──► /xrpc/com.atproto.space.notifyWrite
                                     (service auth iss=<groupDid>,                  verify jwt, enqueue space.sync
                                      aud=did:web:laundryroom.social#laundryroom_spaces)
                                                                         5. credential as the group:
                                     ◄── getDelegationToken (group master session) ──
                                     ◄── getSpaceCredential + rfc 9421 signature ──
                                  6. ◄── listRepos(cursor = stored spaceRev) ──────
 7. ◄──────────── listRepoOps(since = stored rev) · verifyCommit · LtHash match ──── (fallback: getRepo + verifyRepoCarFull)
                                                                         8. index → served only to viewers
                                                                            access.ts allows
```

the other flows (group creation, join, leave, ban, status change, local records and lifting, the ga move) are under "groups", "private data on spaces" and "phases".

## data model mapping

### where things go, by group status

the columns follow `resolveGroupAccess` in `packages/api/src/access.ts`. the protocol side can express "anyone signed in" (simplespace `publicPolicy`) and "listed members" (`memberListPolicy`). it cannot express "anonymous", "by link" or "opted into nsfw", so the appview covers those, never more widely than `access.ts` allows.

| status | anonymous | signed in | members | group's **public repo** | `group.opensocial.meta/self` read | other spaces |
|---|---|---|---|---|---|---|
| active | profile, meetups | same | + member content | `social.laundryroom.group.profile/self`, `community.lexicon.calendar.event` mirrors of non-hidden meetups, `group.opensocial.declaration/self` (once the meta space exists, phase 3) | public | member list |
| hidden | profile, meetups, by link only (noindex, not in sitemap or search) | same | + member content | **nothing** | member list | member list |
| private | — | profile (to ask to join) | everything | **nothing** | public (= any signed-in atproto user) | member list |
| nsfw | — | profile if opted in | everything if opted in | **nothing** | member list | member list |
| archived | — | — | everything | **nothing** | member list | member list |

production fills these columns step by step: the public repo in phases 3–4, the meta and members spaces in phase 3, the forum space in phase 5, the calendar spaces in phase 6. until a feature moves, its content stays in today's postgres tables behind the same `GroupContentStore` interface.

status changes:
- leaving `active` deletes the public profile, the mirrors and the declaration. it updates the meta read policy and swaps the handle to an opaque one.
- the ui warns before a group becomes active that this is "public on the network; other apps and archives may keep copies", which was already the old plan's rule.

### table by table

| table (today) | native home | author · location | nsid stability | notes |
|---|---|---|---|---|
| `user` | the identity (did; handle from the did doc) + `social.laundryroom.actor.profile/self` {displayName, description ← bio, pronouns, links[], avatar blob} | user · public repo | ours | the profile record is optional and its public status is said at onboarding; name/avatar fall back to `app.bsky.actor.profile`. new column `did` (unique). `email` (not null, unique) gets a placeholder `<did with non-alnum → _>@atproto.invalid`; the real address goes in `contact_email` from `account:email`. `role` (system role) and `flags` (nsfw opt-in, email opt-in, …) stay appview-only. |
| `account`, `session`, `verification` | better auth stays as the cookie layer; `account` rows with `providerId 'atproto'`, `accountId = did`; plus `atproto_oauth_state`, `atproto_oauth_session` | appview | — | google/magic-link rows go after the linking window. |
| `group` | a did:plc account on pds.lndry.social. **meta space**: `group.opensocial.profile/self` {displayName ≤ 64 graphemes ← name, description, avatar ≤ 2 MB png/jpeg/webp ← image, joinPolicy (`open` for active/hidden, `approval` for private/nsfw), url}, plus `social.laundryroom.group.profile/self` {displayName, description, avatar, avatarAlt ← imageDescription, locationName ← location, location?: `community.lexicon.location.*`, country, timeZone, labels (self-label for nsfw), createdAt}. **public repo (active only)**: the same `social.laundryroom.group.profile/self` and `group.opensocial.declaration/self` {meta: space-ref} | group | draft / ours | `name` is unique and up to 255 characters today; the draft allows 64 graphemes, so shorten at migration. `status` maps to policies + mirrors (table above). `moderationStatus` and `aiSearchText` stay appview-only. a `country` (iso 3166) per group is new; it makes `location.address` valid. |
| `group_member` owner/admin/moderator/member | `group.opensocial.membership/<memberDid>` {member, roles[], createdAt} in members/self, plus `group.opensocial.role/<roleId>` and `group.opensocial.permissions/self` (role bindings, see "groups"), plus simplespace `putMember` on every space | group | draft | `group_member` stays the **authoritative projection** for reads: laundryroom is the only writer of `putMember`, and it reconciles with `listMembers` on a timer. no public roster, ever. |
| `group_member` pending | `join_request` (appview) | appview | — | the draft also treats join requests as host state, not records. |
| `group_member` banned | membership deleted, `removeMember` on every space, and a group-authored `group.opensocial.label` {subject: `#accountSubject` {did}, val: `!takedown`} in members/self, plus a `group_ban` row checked on every join | group + appview | draft | the draft has no ban semantics, only eject + labels. |
| `meetup` | `community.lexicon.calendar.event` authored by the group in **calendar/self**; hidden meetups go in **calendar/staff**. plus `social.laundryroom.calendar.eventInfo/<event rkey>` {event: strongRef, capacity ← attendeeLimit, image blob, imageAlt, organizer: did ← organizerId, locationText}. active groups also get a **public mirror** (the event record only) in the group's public repo for non-hidden meetups | group | stable (community) / ours | field map below. deleting = `status: …#cancelled`; never delete, because strongRefs would orphan. "full" is derived. |
| `attendee` going / not_going | `community.lexicon.calendar.rsvp` {subject: strongRef to the canonical event, status `#going` / `#notgoing`} in the **member's** space repo of calendar/self, rkey = the event's rkey (so one per member and event). an opt-in public copy goes in the member's public repo, pointing at the mirror | member | stable (community) | rsvps from other apps on the public mirror are indexed; their count is shown to everyone, names to members only. |
| `attendee` waitlist | nothing in the rsvp (it has no waitlist status). the appview computes it from rsvp order + capacity. optionally the group writes `social.laundryroom.calendar.attendance/<event rkey>` {event, going[], waitlist[]} as the authoritative outcome | group | ours | later in phase 6. |
| `discussion` | `social.laundryroom.forum.thread` {title, text, subject?: at-uri (a meetup), createdAt} in the member's space repo of **forum/self** | member | ours (alpha) | do not depend on `com.atmoboards.forum.*`: it is unpublished and only illustrative. |
| `comment` | `social.laundryroom.forum.reply` {thread: strongRef, parent?: strongRef, text, createdAt} | member | ours (alpha) | |
| `moderationStatus` (group, discussion, comment) | the verdict (llm or manual) stays appview state. a removal becomes a group-authored `group.opensocial.label` {subject: `#recordSubject` {uri, cid}, val: `!hide`, rule?} **in the same space** | group | draft | labels on space content never go on a public label stream. |
| `pledge_board` | `social.laundryroom.pledge.board` {event: strongRef, title, description, createdAt} in calendar/self | group | ours | |
| `pledge` | `social.laundryroom.pledge.item` {board: strongRef, title, description, capacity, sortOrder} | group | ours | |
| `pledge_fulfillment` | `social.laundryroom.pledge.fulfillment` {item: strongRef, quantity, createdAt}, rkey = the item's rkey, which keeps today's "one row per user and pledge" | member | ours | |
| `notification` | appview only | — | — | derived from the index. |
| `group_promotion` | appview only | — | — | |
| `group_short_code` | appview only (code → group did) | — | — | a short code resolves only to what the viewer may see (see "no new leaks"). |

member-authored rows (`attendee` → rsvp, `pledge_fulfillment`, `discussion`, `comment`): a member whose pds has no spaces gets the identical record as a **local record** in our index (author = their did, `source = local`), lifted into their space repo later. see "local records".

`meetup` → `community.lexicon.calendar.event` (published fields: name\*, createdAt\*, description, startsAt, endsAt, mode, status, locations[], uris[]):

| meetup | calendar.event |
|---|---|
| title | `name` |
| description | `description` |
| startTime | `startsAt` |
| startTime + duration | `endsAt` |
| — | `mode`: `community.lexicon.calendar.event#inperson` |
| status `active`, `full` | `status`: `#scheduled` |
| `cancelled` / `postponed` | `#cancelled` / `#postponed` |
| `hidden` | lives in calendar/staff and is never mirrored |
| `archived` | unchanged record; dropped from listings |
| location (free text) | `locations: [{ $type: "community.lexicon.location.address", country: <group country>, name: <text> }]` once the group has a country (`address` requires `country`); otherwise omitted, and the text stays in `eventInfo.locationText` |
| — | `uris: [{ uri: "https://www.laundryroom.social/en/meetup/<id>", name: "laundryroom" }]` |
| createdAt | `createdAt` |

### nsids and how stable they are

| nsid | kind | stability |
|---|---|---|
| `community.lexicon.calendar.event`, `.rsvp`, `community.lexicon.location.*` | records | published by lexicon.community (`_lexicon.calendar.lexicon.community` → `did:plc:mtr7qrqtcyseedx3jyr5o7db`); additive changes only. 487 repos with events and 1,898 with rsvps on relay1 (2026-10-03). |
| `com.atproto.repo.strongRef`, `app.bsky.actor.profile` | refs / read only | stable |
| `group.opensocial.meta`, `group.opensocial.members` | space types | **draft**, commit `d2c89a9744afad46ce815e507164550935f14ad1` (2026-09-29). unpublished: there is no `_lexicon.opensocial.group` txt. the name may become `group.intermodal.*` (discourse 1268; bnewbold "now leaning towards" opensocial.group on 2026-10-02, no decision date). |
| `group.opensocial.profile`, `.rule`, `.permissions`, `.role`, `.membership`, `.space`, `.access`, `.label`, `.declaration` | records written by the group | draft, as above. actions may become nsids (#7), crud-only methods may be dropped (#8/#12), the label may move to a `com.atproto` record (#3). |
| `group.opensocial.acceptance`, `.invite`, `group.opensocial.invites` | **not used yet** | a member would need a `space:group.opensocial.members` or `.invites` scope, and the authorization server must resolve that space type's declaration at authorize time. it is unpublished, so the whole login would fail with `invalid_scope`. |
| `social.laundryroom.calendar`, `social.laundryroom.forum` | space types (ours) | `type: "space"` is itself alpha lexicon syntax |
| `social.laundryroom.actor.profile`, `.group.profile`, `.calendar.eventInfo`, `.calendar.attendance`, `.pledge.board`, `.pledge.item`, `.pledge.fulfillment`, `.forum.thread`, `.forum.reply` | records (ours) | free to change until the first production write of each; after that, additive only (new fields optional forever, a breaking change means a new nsid) |
| `social.laundryroom.authFull` | permission set | ours; its `space` entries are alpha-only |
| `com.atproto.space.*` (21 methods), `com.atproto.simplespace.*` (8) | xrpc | **alpha**, breaks weekly. the uri scheme is still debated: `at://<did>/space/<type>/<skey>/…` today, `ats://` proposed. atmo-events already uses `ats://`. |

every nsid, action string and the opensocial commit live in **one constants module** (`packages/atproto/src/nsid.ts`), and none is encoded in a postgres enum. a rename is then one commit plus a re-write of the group-authored records:

```ts
// packages/atproto/src/nsid.ts — the only place nsids and action strings appear
export const OPENSOCIAL_REV = "d2c89a9744afad46ce815e507164550935f14ad1";
export const NSID = {
  event: "community.lexicon.calendar.event",
  rsvp: "community.lexicon.calendar.rsvp",
  groupMeta: "group.opensocial.meta",
  groupMembers: "group.opensocial.members",
  groupProfile: "group.opensocial.profile",
  groupMembership: "group.opensocial.membership",
  groupLabel: "group.opensocial.label",
  calendarSpace: "social.laundryroom.calendar",
  forumSpace: "social.laundryroom.forum",
  thread: "social.laundryroom.forum.thread",
  reply: "social.laundryroom.forum.reply",
  // …
} as const;
```

### lexicons we publish

json goes in `packages/lexicons/`. it is published as `com.atproto.lexicon.schema` records (rkey = the full nsid) by a laundryroom account on pds-social: handle `laundryroom.social` via a `_atproto.laundryroom.social` txt. `_lexicon` txt records are not hierarchical, so each authority needs its own:

| txt record (laundryroom.social zone, vercel dns) | covers |
|---|---|
| `_lexicon.laundryroom.social` → `did=<lexicon account did>` | `social.laundryroom.authFull`, `social.laundryroom.calendar`, `social.laundryroom.forum` |
| `_lexicon.calendar.laundryroom.social` | `…calendar.eventInfo`, `…calendar.attendance` |
| `_lexicon.pledge.laundryroom.social` | `…pledge.board`, `.item`, `.fulfillment` |
| `_lexicon.forum.laundryroom.social` | `…forum.thread`, `.reply` |
| `_lexicon.group.laundryroom.social` | `…group.profile` |
| `_lexicon.actor.laundryroom.social` | `…actor.profile` |

a space type declaration (it must resolve before any login that names it in a scope):

```json
{
  "lexicon": 1,
  "id": "social.laundryroom.forum",
  "defs": {
    "main": {
      "type": "space",
      "key": "literal:self",
      "name": "laundryroom group discussions",
      "collections": [
        "social.laundryroom.forum.thread",
        "social.laundryroom.forum.reply",
        "group.opensocial.access",
        "group.opensocial.label"
      ]
    }
  }
}
```

`social.laundryroom.calendar` has the same shape, with `"key": "any"` (skeys `self` and `staff`) and collections:
- `community.lexicon.calendar.event`, `community.lexicon.calendar.rsvp`;
- `social.laundryroom.calendar.eventInfo`, `.attendance`;
- `social.laundryroom.pledge.board`, `.item`, `.fulfillment`;
- `group.opensocial.access`, `group.opensocial.label`.

foreign collections are allowed in a space declaration. there is no upstream calendar space type; `fyi.opensocial.events` is the precedent.

the permission set:

```json
{
  "lexicon": 1,
  "id": "social.laundryroom.authFull",
  "defs": { "main": { "type": "permission-set", "title": "laundryroom", "detail": "groups, meetups and rsvps on laundryroom",
    "permissions": [
      { "type": "permission", "resource": "repo", "collection": ["social.laundryroom.actor.profile"], "action": ["create", "update", "delete"] },
      { "type": "permission", "resource": "space", "spaceType": "social.laundryroom.forum", "authority": "*", "skey": "self",
        "collection": ["social.laundryroom.forum.thread", "social.laundryroom.forum.reply"], "action": ["create", "update", "delete"] },
      { "type": "permission", "resource": "space", "spaceType": "social.laundryroom.calendar", "authority": "*", "skey": "self",
        "collection": ["community.lexicon.calendar.rsvp", "social.laundryroom.pledge.fulfillment"], "action": ["create", "update", "delete"] }
    ] } }
}
```

on stable pdses (main), `include-scope.ts` skips `space` entries and the set should still resolve. this is inferred from code, *unverified on bsky.social*. stable `@atproto/lex` 0.3.14 and goat v0.2.5 may refuse `type: "space"` / `resource: "space"` (*unverified*). the fallback is to publish the json with a plain `com.atproto.repo.putRecord` and build the alpha-only types with the alpha `@atproto/lex`.

rules carried over: new fields stay optional forever; required fields can never be removed; records should stay at a few dozen kb; images are blobs (`accept: image/*`, `maxSize` 2 mb, matching `group.opensocial.profile`). the reference pds does **not** validate custom lexicons: it reports `validationStatus: 'unknown'`, and `validate: true` throws "unknown lexicon type". so we validate with `$parse` before every write and again on ingest.

## identity

### sign-in (atproto only)

the backend-for-frontend pattern (statusphere, leaflet), wired into better auth:

- **packages, pinned and upgraded together:**
  - `@atproto/oauth-client-node` 0.5.9 (esm, node ≥ 22; 0.5.0 renamed the hooks to `onSessionUpdated` / `onSessionDeleted`);
  - `@atproto/lex` 0.3.14 (`new Client(oauthSession)`);
  - `@atproto/lex-server` 0.1.21;
  - `@atproto/lex-password-session` 0.2.4;
  - `@atproto/identity` 0.5.16;
  - `@atproto/xrpc-server` 0.13.4;
  - `@atproto/tap` 0.4.12 (worker only; add it to `serverExternalPackages` if next ever imports it).
- **client metadata** is served by a next route at `/oauth-client-metadata.json`, on www, which does not redirect. the pds fetches the client id and jwks with `redirect: 'error'`, and every requested scope token must appear verbatim in `scope`:

```json
{
  "client_id": "https://www.laundryroom.social/oauth-client-metadata.json",
  "client_uri": "https://www.laundryroom.social",
  "redirect_uris": ["https://www.laundryroom.social/api/auth/atproto/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "application_type": "web",
  "scope": "atproto account:email?action=read blob:image/* include:social.laundryroom.authFull repo:social.laundryroom.actor.profile repo:community.lexicon.calendar.rsvp space:social.laundryroom.forum?authority=*&skey=self&collection=social.laundryroom.forum.thread&collection=social.laundryroom.forum.reply&action=create&action=update&action=delete space:social.laundryroom.calendar?authority=*&skey=self&collection=community.lexicon.calendar.rsvp&collection=social.laundryroom.pledge.fulfillment&action=create&action=update&action=delete",
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "dpop_bound_access_tokens": true,
  "jwks_uri": "https://www.laundryroom.social/oauth/jwks.json"
}
```

- **scopes.**
  - request first: `atproto account:email?action=read blob:image/* include:social.laundryroom.authFull repo:community.lexicon.calendar.rsvp`.
  - on `OAuthResponseError` with `.error === 'invalid_scope'`, retry with the raw list: `atproto account:email?action=read blob:image/* repo:social.laundryroom.actor.profile repo:community.lexicon.calendar.rsvp`, plus two raw space scopes (both are also in the metadata above):
    - `space:social.laundryroom.forum?authority=*&skey=self&collection=social.laundryroom.forum.thread&collection=social.laundryroom.forum.reply&action=create&action=update&action=delete`
    - `space:social.laundryroom.calendar?authority=*&skey=self&collection=community.lexicon.calendar.rsvp&collection=social.laundryroom.pledge.fulfillment&action=create&action=update&action=delete`
  - never request `space:group.opensocial.*` (unpublished declaration → `invalid_scope` for the whole login) or `transition:generic`.
  - writing as a group never uses user scopes: it goes through the group's own session.
  - detect whether spaces were granted with `ScopePermissions.allowsSpace(...)` from the alpha `@atproto/oauth-scopes`, as bulletin does, and keep the answer with the session. a pds without spaces (bsky.social) grants no `space:` scope, so its users' members-only writes become local records (see "local records").
  - main's oauth provider refuses a request only for a missing `atproto`, for `openid`, or for an `include:` set it cannot resolve, so a raw `space:` token should be ignored there rather than refused. this is inferred from `request-manager.ts`, *unverified on bsky.social*, and checked in the phase-0 spike.
- **the client.**
  - `new NodeOAuthClient({ clientMetadata, keyset: [await JoseKey.fromImportable(process.env.ATPROTO_OAUTH_KEY_1, 'k1')], stateStore, sessionStore, requestLock, didCache: noop })`.
  - key rotation: add `k2` and keep `k1` in the jwks until its sessions are gone, because sessions are bound to the client key.
  - the no-op `didCache` is leaflet's trick: a user who moved pds is never sent to the old one.
  - restore is de-duplicated per did in-process.
- **stores.**
  - `atproto_oauth_state(key pk, value, created_at)`, swept after 1 h.
  - `atproto_oauth_session(did pk, value, updated_at)`. the value is encrypted (it holds the private dpop jwk and the single-use refresh token) with `symmetricEncrypt` from `better-auth/crypto`.
- **`requestLock`.** without it, web and worker race the single-use refresh token and the authorization server revokes the session:

```ts
const requestLock = async <T>(name: string, fn: () => T | PromiseLike<T>): Promise<T> => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout = '45s'");
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [name]); // name = '@atproto-oauth-client-<did>'
    const r = await fn();
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
};
```

- **better auth plugin** (in repo, modelled on the unmerged better-auth pr #9565; `@better-auth/atproto` is a 404 on npm; better-auth 1.7.7).
  - endpoints come from `createAuthEndpoint`: `/api/auth/atproto/sign-in` and `/api/auth/atproto/callback`.
  - on callback: `oauthClient.callback(params)`. then find the account by (`providerId 'atproto'`, `accountId = did`) with `adapter.findOne`, never through `findOAuthUser`, which falls back to email.
  - new people: `internalAdapter.createOAuthUser({ name, email: placeholder, emailVerified: false }, { providerId: 'atproto', accountId: did })`.
  - a person already signed in: `internalAdapter.linkAccount(…)`.
  - then `createSession` + `setSessionCookie`, and a redirect to a callback url checked against `trustedOrigins`.
  - `tap.addRepos([did])` for every new did.
- **routing.** the next-intl matcher is `/((?!api|_next|_vercel|.*\\..*).*)`. paths with a dot (`/oauth-client-metadata.json`, `/oauth/jwks.json`, `/.well-known/did.json`, `/xrpc/<nsid>`) are already skipped. add `xrpc` to the negative lookahead for `/xrpc/_health`. the callback sits under `/api`.
- **dead oauth sessions.** `TokenRefreshError`, `TokenRevokedError` and `TokenInvalidError` → a "reconnect your account" page that restarts sign-in with the did. the better auth session (30 days) and the oauth session (bsky.social refresh ~3 months; each refresh token ≤ 180 days) do not line up, so this path is normal, not an error.
- **identity changes.** handles change and dids move between pdses. tap's identity events refresh the cached handle. render `handle.invalid` when the two-way check fails. deactivated/suspended accounts are hidden; deleted/takendown accounts are purged, including their space records in the index.

### hosted sign-up on lndry.me

- the login page has one handle field and a "create a lndry.me account" button. an empty field or the button calls `client.authorize('https://pds.lndry.me', { prompt: 'create', scope, state })`. `login_hint` cannot be passed when authorize gets a url, so the handle cannot be prefilled.
- `PDS_INVITE_REQUIRED=true`. **invites come from a pool, and during the alpha they go to testers only:**
  - the owner mints codes: `curl -u admin:$PDS_ADMIN_PASSWORD -X POST https://pds.lndry.me/xrpc/com.atproto.server.createInviteCodes -H 'content-type: application/json' -d '{"codeCount":50,"useCount":1}'`, or `PDS_HOST=https://pds.lndry.me goat pds admin create-invites --count 50 --uses 1` from the laptop. the alpha image has no goat or `pdsadmin` inside.
  - the codes are loaded into `invite_code(code pk, handed_out_at, handed_out_to, used_at)` in laundryroom-db.
  - laundryroom shows a code, with a copy button ("your invite code: …"), only to testers: existing users during the linking window, and people holding a tester link from the owner. everyone else sees "lndry.me is invite-only during the alpha; sign in with any atproto account". it alerts when fewer than 10 codes are left.
  - whether the oauth sign-up ui accepts a prefilled invite code is *unverified*. if it does not, the person copies and pastes it.
  - shared codes share their use count, and a deleted account does not return its use: single-use only.
- the pds sends its own confirmation email over smtp (resend, port 2465). handle rules apply to people too: 3–18 characters, one label, not reserved.
- lndry.me accounts are real atproto accounts: they work in bluesky and every other app, and can migrate away. that is the point, and it is why they are not custodial.

### email via `account:email`

- with `account:email?action=read`, `com.atproto.server.getSession` returns `email` and `emailConfirmed`. without the scope, the pds strips them.
- store the address in `user.contact_email` only when it is confirmed, and refresh it at every sign-in. `user.flags` (`email_notifications`) still decides whether we send.
- no scope or no confirmed email → in-app notifications only.
- **never link or merge accounts by the email a pds reports.** a self-hosted pds can claim any address as confirmed.

### the ~18 existing users (recommended: link, then retire legacy sign-in)

1. phase 2 deploys with `disableSignUp: true` on google and `magicLink`: no new legacy accounts.
2. a banner, plus one email to each user: "laundryroom is moving to atproto accounts: create your lndry.me account or connect an existing one by <date>".
3. connecting works like this: sign in the old way, start atproto sign-in (create or bring your own), and the callback runs `linkAccount` onto the **same user row**. memberships, rsvps, pledges and posts stay attached.
4. after 4 weeks:
   - google and magic link are removed from `packages/auth` (including the `/auth/confirm` interstitial).
   - unlinked users are deactivated. their content stays in the legacy tables, read-only, attributed to "former member". it is **not** turned into space or local records in phases 5–6, because there is no did to author it.
   - their personal data is deleted after 90 days, with one more email.
5. the alternative is a fresh start: simpler, but foodiespace loses its history. not recommended at this size.

### account deletion

"delete my laundryroom account" does four things:
- it deletes every `social.laundryroom.*` and calendar record we wrote to the person's repo, public and space (with their oauth grant);
- it purges the index and appview state;
- it revokes the oauth session;
- it never touches the identity.

deleting a lndry.me account itself is a pds matter. it goes through the pds's own account ui, or through admin `deleteAccount` on request; whether the oauth ui offers self-service deletion is *unverified*.

## groups

### group accounts on lndry.social

a record is signed by its author, so "admins co-edit the group's meetups" needs a shared author: the group. today the only practical form of an opensocial "group host" is a **group-host-lite**:
- our own pds holds the group accounts;
- laundryroom holds their credentials;
- laundryroom enforces roles.

the precedents are tompscanlan's atmo-events branch `feat/groups-opensocial` (2026-10-03) and the arbiter.

creating a group (`LocalPdsGroupHost.createGroup`, run in the worker):

1. validate the slug: `[a-z0-9-]`, 3–18 characters, no leading or trailing `-`, not reserved. copy the pds's `reserved.ts` (~1,030 names, e.g. `group`, `event`, `team`, `app`, `test`, `me`, `my` are taken; `foodiespace`, `events`, `food`, `meetup` are free), or treat `HandleNotAvailable` as reserved. a taken handle comes back as `InvalidRequest "Handle already taken"`.
   - **active groups** get a readable slug, with `-2` or four base32 characters appended on a collision.
   - **hidden, private, nsfw and archived** groups get an opaque `g-<6 base32>`.
2. mint a single-use invite with admin `com.atproto.server.createInviteCode {useCount: 1}` (laundryroom holds pds-social's admin password).
3. `com.atproto.server.createAccount {handle: "<slug>.lndry.social", email: "groups+<slug>@lndry.social", password: <32 random bytes, base64url>, inviteCode, recoveryKey?: <owner's did:key>}`. the email must be valid, not disposable and unique; plus-addressing does that. the mailbox should accept mail or bounces pile up.
4. `com.atproto.server.createAppPassword {name: "laundryroom-writer"}`.
5. store both secrets aes-256-gcm encrypted in `group_credential(group_did pk, pds_url, handle, app_password_enc, master_password_enc, key_id, created_at, rotated_at)`. the key is `GROUP_CREDENTIAL_KEY_1` in dokku config, separate from `AUTH_SECRET`, with a `_2` slot for rotation.
   - **the master password is kept**: `com.atproto.space.getDelegationToken` needs a full session (`ACCESS_FULL`; app passwords are refused), and the space syncer reads as the group.
   - if we only ever wrote and never synced, it could be discarded, as atmo-events does.
6. check `rotationKeys` at `https://plc.directory/<did>/data`, highest priority first: [owner's key if offered (shown once, never stored), `PDS_RECOVERY_DID_KEY` (laundryroom's group-recovery key; private half offline, never on falkenstein), the pds rotation key].
7. write the public profile (active groups only), and create the meta and members spaces (next section). the calendar and forum spaces follow in phases 5–6.
8. call `tap.addRepos([groupDid])`.

the profile limits matter: `displayName` is at most 64 graphemes. the name moves into the profile, and the handle can be renamed later with `com.atproto.identity.updateHandle` (app password is enough) or admin `updateAccountHandle`, which bypasses the reserved list but not the length limit.

custody, in one table:

| secret | where | used for | if lost |
|---|---|---|---|
| group app password | `group_credential`, encrypted | every write as the group (public repo, space records, simplespace management) | admin `updateAccountPassword` + new app password (this revokes all refresh tokens) |
| group master password | `group_credential`, encrypted, separate column | `getDelegationToken` for the space syncer only | same |
| pds-social admin password | dokku config of `pds-social` and `laundryroom` | invites for new groups, account recovery, takedowns | redeploy with a new one |
| pds rotation key (each pds) | dokku config + offline copy | plc operations for every account on that pds | groups/people can only be recovered with a higher key |
| group-recovery key (k256, `goat key generate -t k256`) | offline only; public did:key in `PDS_RECOVERY_DID_KEY` on pds-social only | re-homing every group did if pds-social is lost | — |

**never set `PDS_RECOVERY_DID_KEY` on pds-me**: people's identities must not be recoverable by laundryroom.

### how the app acts as the group

- trpc runs the `access.ts` check (`isGroupAdmin`, `canSeeHiddenMeetups`, …), then enqueues a `group.write` job. the browser never holds group credentials.
- the worker runs `PasswordSession.login({ service: 'https://pds.lndry.social', identifier: groupDid, password: appPassword })` from `@atproto/lex-password-session`.
  - legacy bearer sessions last 120 min (access) and 90 days (refresh). cache them in the db and refresh them, because `createSession` is limited to 30 per 5 min and 300 per day per identifier+ip.
  - writes go through `putRecord` / `applyWrites` (atomic batches), and space writes through `com.atproto.space.*`.
  - the worker sends `x-ratelimit-bypass: $PDS_RATE_LIMIT_BYPASS_KEY` on pds-social.
- the space alpha accepts these legacy bearer and app-password sessions for `space.createRecord/putRecord/deleteRecord/applyWrites` and for every `simplespace.*` management call. the proposal's text says writes "accept only an oauth credential", so **ga may close this** (see risks). everything goes through one interface, so that change stays local:

```ts
// packages/atproto/src/groups/group-host.ts
export interface GroupHost {
  createGroup(input: { slug: string; ownerDid: string; status: GroupStatus }): Promise<{ did: string; handle: string }>;
  writer(groupDid: string): Promise<Client>;      // app-password session today; nested-oauth session from a real group host later
  syncSession(groupDid: string): Promise<Client>; // full session, only for getDelegationToken
  setHandle(groupDid: string, handle: string): Promise<void>;
  deactivate(groupDid: string): Promise<void>;
}
// LocalPdsGroupHost   — pds.lndry.social, credentials held by laundryroom (now)
// OpensocialGroupHost — nested oauth against a group host (when one exists)
```

### roles, join requests and bans in opensocial terms

`access.ts` stays the source of truth. the records mirror it so a future opensocial host or another app reads the same intent. `group.opensocial.permissions/self` (draft action strings, which will probably become nsids):

| laundryroom role | `group.opensocial.role/<id>` | actions | assignable |
|---|---|---|---|
| owner | `owner` | all 12: `mod.read mod.resolve label takedown invite admit eject role.assign space.create space.configure space.delete group.configure` | owner, admin, moderator, member |
| admin | `admin` | everything except `space.delete` | moderator, member |
| moderator | `moderator` | `mod.read mod.resolve label` (today's moderators see hidden meetups and moderate; they do not admit people) | — |
| member | `member` | none; `defaultRoles: ["member"]` | — |
| pending | no role | a `join_request` row (appview); the draft's `listJoinRequests` is host state too | |
| banned | no role | membership deleted + an account label `!takedown` in members/self + a `group_ban` row | |

the flows (all writes as the group, through `group.write`):

- **join, open group** (active/hidden, `joinPolicy: open`):
  - check `group_ban`;
  - insert `group_member(member)`;
  - write `group.opensocial.membership/<did>`;
  - `putMember {space, did, read: true, write: true}` on calendar/self and forum/self; `read: true, write: false` on members/self and meta/self (if it uses a member list) and, for staff roles, on calendar/staff.
- **join, approval group** (private/nsfw): insert a `join_request` and notify the admins. "approve" then runs the open-join steps. this is the `pending` flow of 2026-10-03, unchanged.
- **role change**: rewrite the membership `roles[]`, and `putMember` / `removeMember` on calendar/staff.
- **leave**:
  - delete the membership and `removeMember` everywhere;
  - their posts stay (it is their repo; they can delete them).
- **ban**: the leave steps, plus the label, plus `group_ban`. the appview then hides the member's content by default. new writes are refused at the space host (`notifyWrite` → 403). credentials they already hold stay valid for up to 10 min; the reference pds never sends `notifyCredentialRevoked`.
- **reconcile**: a daily job compares `group_member` with `simplespace.listMembers` (owner-only, as the group) for every space and repairs drift.

what we do **not** implement:
- the 24 `group.opensocial.*` xrpc methods (`requestJoin`, `admitMember`, `ejectMember`, …), nested oauth for stewards, and `group.opensocial.invites`.
- they belong to a group host, and our reference pds does not serve them. so other apps can read our groups' public data, and the space data members may read, but cannot manage our groups.
- revisit when bluesky publishes its group host (bnewbold, 2026-09-19: "planning to internally prototype… could share the source code"; 2026-09-22: "hesitant to commit to another packaged distribution"), or when the draft settles.

## private data on spaces

### which space holds what (per group)

| space | type / skey | read policy | write policy | written by | records |
|---|---|---|---|---|---|
| meta | `group.opensocial.meta` / `self` | public for active/private; member list otherwise | member list (group only) | group | `group.opensocial.profile`, `social.laundryroom.group.profile`, `group.opensocial.rule`, `group.opensocial.access` |
| members | `group.opensocial.members` / `self` | member list | member list (group only, for now) | group | `permissions`, `role`, `membership`, `space` (one per space), `access`, account labels |
| calendar | `social.laundryroom.calendar` / `self` | member list | member list | group (events, eventInfo, pledge boards/items, labels); members (rsvps, fulfillments) | see mapping |
| staff calendar | `social.laundryroom.calendar` / `staff` | member list (owner/admin/moderator) | group only | group | hidden meetups |
| forum | `social.laundryroom.forum` / `self` | member list | member list | members (threads, replies); group (labels) | see mapping |

creating a space (as the group, app-password session):

```
POST https://pds.lndry.social/xrpc/com.atproto.simplespace.createSpace
Authorization: Bearer <group session>
{ "spaceType": "social.laundryroom.forum", "skey": "self",
  "readPolicy":  { "$type": "com.atproto.simplespace.defs#memberListPolicy" },
  "writePolicy": { "$type": "com.atproto.simplespace.defs#memberListPolicy" },
  "appAccess":   { "$type": "com.atproto.simplespace.defs#open" } }
→ { "uri": "at://did:plc:<group>/space/social.laundryroom.forum/self" }
```

- **member list, not managing app.**
  - the `managingAppPolicy` would have the pds call our `com.atproto.simplespace.checkUserAccess` on every credential. it **fails closed**: if laundryroom is down, credentials are refused and members' `notifyWrite` gets a 403 that is not retried.
  - member list keeps working while we are down. the cost is the `putMember` mirroring above.
- **opensocial on simplespace is a deviation.** the draft says it "does not layer on top of simplespaces". `group.opensocial.access` records are informational only, because simplespace enforces its own policy. we keep them consistent so a real opensocial host would read the same intent.
  - creating simplespaces with `group.opensocial.*` space types works on the alpha pds per the atmo-events prototype; *unverified by us*, it is checked in the phase-0 spike.
- `appAccess: #open`, as in bulletin and atmo. an `#allowList` would lock other apps out, and it binds the authority too.
- `registerNotify {space, service: "did:web:laundryroom.social#laundryroom_spaces"}` for calendar/self and forum/self (the spaces members write into). a registration lasts 1 day; renew it 1 h before expiry, as bulletin does.

### credentials, sync and indexing

- **getting a credential** (`packages/atproto/src/spaces/credential.ts`, the only place that imports `@atproto/space`):
  - `getDelegationToken {space}` on the reader's pds. it needs a full session. it returns a jwt with `typ: atproto-space-delegation+jwt`, `aud: <authority>#atproto_space_host`, valid 60 s, single-use.
  - `P256Keypair.create()` from `@atproto/crypto`: a fresh key per credential.
  - `POST <authority pds>/xrpc/com.atproto.space.getSpaceCredential {space}`, with `Authorization: Bearer <delegation>` and the rfc 9421 headers from `createSpaceSigHeaders(key, { authorization })`.
  - the result is `typ: atproto-space-credential+jwt`, 600 s by default (3600 max), bound to the key by `cnf.kid`.
  - using it: `Authorization: Atproto-Space <credential>` plus `Atproto-Space-Audience: <repo did | authority did>`, signed over both headers with `createSpaceSigHeaders(key, { authorization, audience })`.
  - refresh 5 s before expiry; on `CredentialRevoked` / `JwtExpired`, mint a new one.
- **who reads.** the syncer always mints from the **group's own** master session: the space authority always passes the user check. a sync credential is **never** treated as a viewer's permission (contrail's rule).
- **sync** (bulletin's engine is the template; `bluesky-social/bulletin` at 3428660 is the only working reference app on the 10-01 protocol):
  - triggered by notify, plus a catch-up every 5 min per space, because the hop from space host to syncer is best-effort, with a 10 s timeout and no retry.
  - `listRepos {space, cursor: <stored spaceRev>, limit: 1000}`. the cursor is an exclusive spaceRev checkpoint; there is **no** `since` parameter (ezpds pr #661 is wrong about this). pages come ascending; stop at an empty page and keep the previous checkpoint.
  - per repo: `listRepoOps {space, repo, since: <stored rev>}`. apply the ops to an `LtHash` (`RepoCommit.fromState(...).applyOp(...).matches(commit)`) and verify with `verifyCommit(commit, {space, author, rev}, didKey)`. on a mismatch or a missing op log, fall back to `getRepo` (car) + `verifyRepoCarFull`.
  - tables:
    - `space_sync(space_uri pk, authority_did, space_rev, registration_expires_at)`
    - `space_repo(space_uri, repo_did, pds_url, rev, lthash, commit_hash, pk(space_uri, repo_did))`
    - plus index rows in `record` with `space` set.
  - writes made through the appview insert an **optimistic index row** right away (uri + cid from `createRecord`); sync reconciles it.
- **the notify receiver**: `app/xrpc/com.atproto.space.notifyWrite/route.ts` and `…notifySpaceDeleted/route.ts`.
  - verify service auth with `verifyJwt(token, 'did:web:laundryroom.social#laundryroom_spaces', lxm, resolveAtprotoKey)` from `@atproto/xrpc-server`. `@atproto/lex-server`'s `serviceAuth` only accepts a plain-did `aud`, so it cannot be used here.
  - require `iss` to equal the space's authority (a group we host); keep jti nonces in `service_auth_nonce`; enqueue `space.sync`.
  - `hash` arrives as `{"$bytes": "…"}`.
  - `notifySpaceDeleted`, or `SpaceDeleted` on the next credential, → purge every copy.
- **account and identity events** for space authors still come only from the public firehose (tap). no relay carries space data.

### local records (members whose pds has no spaces)

bsky.social and most other pdses do not serve spaces yet, and their oauth servers grant no `space:` scope. their users still take part in members-only places.

- **what a local record is.** exactly the record a space write would carry (`social.laundryroom.forum.thread`, `.reply`, `community.lexicon.calendar.rsvp`, `social.laundryroom.pledge.fulfillment`), with author = the member's did, kept only in our index with `source = local`. it is never published: not in a public repo, not on a relay, not in a space.
- **one index, uniform reads.** the `record` table holds repo, space and local records, and `source` says which. read enforcement, labels, bans and the typed projections treat space and local records the same.
- **writes are routed by the author's capability.** the `GroupContentStore` adapter checks the session's grant with `ScopePermissions.allowsSpace(...)` for that space.
  - granted → `SpacesStore`: `space.createRecord` through the member's oauth session.
  - not granted → `LocalRecordStore`: validate with `$parse`, pick a tid rkey, compute the cid from the dag-cbor encoding as a pds would, and store the uri the record will have in the space (`at://<groupDid>/space/<type>/<skey>/<memberDid>/<collection>/<rkey>`, built through `SpaceRef`).
  - group-authored records always go into spaces: every group lives on pds-social.
- **lifting.** once the member's pds supports spaces and they grant the space scope (which takes a new sign-in, *inferred*), a `record.lift` job writes each local record into their space repo with `space.applyWrites` under the same rkey (both `createRecord` and `applyWrites` take one), `createdAt` kept. sync confirms the write and the row flips to `source = space`. the same record under the same rkey should give the same uri and cid, so strongRefs from replies stay valid (*unverified*; phase-0 spike).
- **the ui says where a post is stored**: "in your atproto space on <pds host>" or "kept by laundryroom until your pds supports spaces". it never nags anyone to switch hosts: bluesky asks apps not to pressure pds operators into deploying spaces early (discourse 1223).
- **what it costs.**
  - local records are the one exception to "postgres is only an index". they fail the rebuild-from-network test, so laundryroom-db backups cover them and the drill keeps `source = local` rows.
  - another app syncing the space sees a reply to a local record as a reference it cannot resolve until that record is lifted.
  - "delete my laundryroom account" deletes the member's local records outright.
- `putMember` lists every member on the group's spaces whatever their pds, so a member whose pds gains spaces can read and write there at once.

### read enforcement

- every read of space-backed content (space and local records alike) goes through `resolveGroupAccess(status, role, isLoggedIn, nsfwOptIn)` over `group_member` + `group_ban`, the list laundryroom itself writes to the space hosts. this is the only rule; there is no second implementation of it in the ui.
- content by banned members is hidden. content by members who left stays visible to members (opensocial and forum convention). the removed member's repo stays in `listRepos`, so filtering happens at read time, not at sync.
- labels in a space (`!hide`) hide the record for everyone but staff.
- space blobs are only served through `com.atproto.space.getBlob` with a credential, after the same check, with `Cache-Control: private, no-store`.

### containing the alpha: adapter, guardrails, weekly routine

- **one package holds the alpha**: `packages/atproto/src/spaces/` (credential, http signatures, the `com.atproto.space.*` / `simplespace.*` calls, sync, uri construction through `SpaceRef` from the alpha `@atproto/syntax`). nothing outside it builds a space uri by hand, because the scheme may become `ats://`.
  - only this package depends on the alpha versions (`@atproto/space`, `@atproto/crypto`, `@atproto/syntax`, `@atproto/lex` at `0.0.0-spaces-alpha-20261001173819`, exact pins, never a range).
  - `@atproto/space`'s `latest` tag points at the stale dpop-era `0.0.0-spaces-alpha-20260818022935`, so never install it without a version.
  - the rest of the monorepo uses the stable versions above. *to verify in the phase-0 spike*: that the two `@atproto/*` versions coexist in one pnpm workspace without type clashes (two `AtUri` classes). fallback: bulletin's approach, everything on alpha plus `pnpm.overrides`, for the whole monorepo until ga.
- **one interface, three stores**: `GroupContentStore` (threads, replies, events, rsvps, pledges, labels).
  - `PostgresStore` wraps today's tables. a feature uses it until it moves: discussions in phase 5, everything else in phase 6.
  - `SpacesStore` writes space records and reads the index.
  - `LocalRecordStore` writes local records for authors without a granted space scope (see "local records").
  - the adapter picks the store per feature and per author, in code. there is one environment, production, plus local dev; there is no environment switch.
- **contract tests** for the adapter run against a local `pnpm --filter @atproto/dev-env start:multi-pds` (atproto checkout at the pinned `permissioned-data-alpha` commit) before every bump. cross-pds checks against a pds we don't run use one developer account on bluesky's hosted alpha pds.
- **fixtures, for local dev and contract tests only**:
  - `packages/atproto/fixtures/*.json` holds synthetic data only: six people (alice … frank, two of them without spaces so local records are covered), three groups (active, private, nsfw), ten meetups, rsvps, pledges and twenty threads. nothing is ever copied from production.
  - `pnpm dev:seed` creates the accounts on the dev env with admin invites and writes the spaces and records. it uses password sessions for speed; the alpha accepts legacy bearer for space writes. a small playwright test covers the real oauth path.
  - the dev env starts empty, so there is no wipe script. seeding stays under 10 min.
  - fixtures and the seed script never point at pds-me, pds-social or laundryroom-db.
- **guardrails for real data on the alpha** (decision 8):
  - lndry.me sign-up stays invite-only for the whole alpha, with codes from the pre-minted pool handed only to testers.
  - every members-only feature carries an "alpha" label: storage may change, and nothing sensitive belongs there. in bluesky's words: "do not upload sensitive information. not your own, and especially not anyone else's."
  - backups exist, and one restore drill has passed, before the first non-owner account is created.
  - every group did carries laundryroom's offline group-recovery key (`PDS_RECOVERY_DID_KEY` on pds-social only, never on pds-me), so group identities survive a broken or lost pds-social.
  - the thursday routine below takes a backup before every bump.
- **the thursday routine**:
  1. run the backup job for both pds volumes and laundryroom-db by hand, and check that it finished.
  2. read the "atproto spaces alpha updates" thread (discourse 1129) and `alpha-migrations/prompt-*.md` on the `permissioned-data` branch.
  3. bump the pinned pds image tag and the alpha npm versions together, in one commit.
  4. run the contract tests against the dev env at the new commit.
  5. deploy both pdses in one short window, then laundryroom. smoke-test `_health`, a space write from pds-me into a pds-social space, and a sync.
  6. if it breaks, go back to the previous image **and** restore the step-1 backup: the alpha's migrations run at start-up and only go forward. if a release cannot carry existing data (the blog warns that "database schemas may change without clean migrations"), stay on the old pin. if it has to be taken, rebuild with the phase-7 move procedure.
  7. change only `packages/atproto/src/spaces/`. if anything outside it has to change, the adapter boundary is wrong; fix the boundary.
  - if a week's break costs more than a day, stay on the previous pin until the next release rather than chase it.

## no new leaks

the 2026-10-03 fixes closed:
- public `group.byId` / `meetup.byId` returning names whatever the status;
- open join into private and nsfw groups.

the native side adds new ways to leak the same things. each has a rule:

| leak path | rule |
|---|---|
| group handles are public (plc, the relay, the pds's public `com.atproto.sync.listRepos`), and the plc audit log keeps old handles forever | opaque `g-xxxxxx` handles for every non-active group. a group that was active keeps its old handle in plc history; the ui says so before a group goes active. |
| public records of the group | only for `active` groups: the profile, the declaration, and mirrors of non-hidden meetups. hidden groups publish **nothing** (the firehose is enumerable, which defeats "hidden"). |
| rosters | never public. no `fyi.opensocial.member`-style public member records, and no public membership handshake. |
| rsvps | members-only space records (or local records) by default; a public copy only on the member's explicit opt-in, for active groups. other apps' public rsvps on our mirrors: count for everyone, names for members only. |
| space blobs (avatars of private groups, meetup images, post images) | never through the public image proxy. served `Cache-Control: private, no-store` after `access.ts`. |
| labels on space content | stay inside the space as `group.opensocial.label`; never on a public label stream or an ozone instance. |
| sync credentials | the group's credential reads everything; it is never a viewer's permission. every read is decided by `access.ts`. |
| removed or banned members | credentials outlive removal by up to 10 min, and their repo stays in `listRepos`. so the appview filters at read time, and `notifyWrite` refuses new writes. |
| short codes, og cards, ics, sitemap | a short code resolves only to what the viewer may see. og images and ics only for meetups anonymous visitors may see. the sitemap only lists `active` groups. |
| the meta space of private groups is "public" | in simplespace terms "public" means "any signed-in atproto user", which is exactly `access.ts`'s "profile for logged-in users". nsfw and hidden groups use a member list instead. |
| logs and errors | never log record values of space content; log uris and cids only. |
| local records | never published and never on any pds; served only through `access.ts`, like space records. lifting writes them into the member's own space repo in the same group space, never into a public repo. their values are never logged either. |
| backups | the pds volumes now hold members-only space data, and laundryroom-db holds local records. on-box copies are root-only (0700); offsite copies are restic-encrypted; a restore drill runs in a scratch app with an empty `PDS_CRAWLERS`, deleted afterwards. |
| the ga move | space data is re-created from the index into the same spaces, under the policies the group's current status allows. the old volumes stay root-only until the move is checked, then they are deleted. |

## ingestion

- **public records**: tap, as its own dokku app (`ghcr.io/bluesky-social/indigo/tap:0.1.10`, digest `sha256:5e20bfe416d29fcd215ed8bf99f10b2ab825a6de4e5599846dd33967ade2abeb`, the same as `latest`; tag `tap-v0.1.10` = 4f47add, 2026-03-11).
  - building `cmd/tap/Dockerfile` from a pinned indigo commit instead gets the 2026-09-01 ssrf-safe car fetches. that matters, because tap fetches repos from arbitrary hosts while sitting on the same docker network as our postgres.
  - env:

```
TAP_DATABASE_URL=postgres://…/tap          # its own dokku postgres service, never laundryroom-db
TAP_ADMIN_PASSWORD=<random>
TAP_RELAY_URL=https://relay1.us-east.bsky.network   # the default
TAP_COLLECTION_FILTERS=community.lexicon.calendar.*,social.laundryroom.*,group.opensocial.declaration,app.bsky.actor.profile
TAP_SIGNAL_COLLECTION=community.lexicon.calendar.event   # only if the discovery feed is wanted (open decision 7)
```

  - the worker consumes it with `new Tap(url, { adminPassword }).channel(indexer).start()` and a `LexIndexer`, which validates records against the lex schemas before the handler runs.
  - delivery is at least once, ordered per repo; handlers are idempotent on (uri, cid). events with `live: false` are backfill.
  - every signed-in did and every group did is added explicitly with `POST /repos/add`. identity events are always delivered for tracked repos.
- **our own pdses** reach tap through the bsky.network relay (`PDS_CRAWLERS`).
  - when a host passes the relay's 100-account cap, or relay lag matters, add one tap per host with `TAP_RELAY_URL=https://pds.lndry.me` (or `.social`) and `TAP_FULL_NETWORK=true`, each with its own database. the repos and cursor tables would collide if shared.
  - full-network mode against a single pds is inferred from `crawler.go` / `firehose.go`, *not documented, unverified*. the signal crawl calls the relay-only `listReposByCollection`, so it cannot be used against a pds.
- **space records**: the syncer above. there is no relay and no tap for spaces.
- jetstream (`wss://jetstream.us-east.bsky.network/…`, v0.3.x since 2026-10-02) stays a fallback for prototyping only. its events are not verified by the consumer.
- the old plan's resource envelope still holds: the filtered streams are tens of mb/day.

## xrpc and did:web

- **the apex redirect.** today `https://laundryroom.social/.well-known/did.json` returns 301 and `https://www.laundryroom.social/.well-known/did.json` returns 404. both atproto did:web resolvers (`@atproto/identity` web-resolver and `@atproto-labs/did-resolver`) fetch with `redirect: 'error'`.
  - fix: exempt `/.well-known/` (and `/xrpc/`) from the apex→www 301.
  - either add an nginx `location ^~ /.well-known/ { proxy_pass … }` include before the redirect for the laundryroom app, or move the apex redirect into `middleware.ts` (redirect everything except `/.well-known/*` and `/xrpc/*`) and attach the apex domain to the app.
  - *check on the box* how the 301 is configured today (the hosting notes say "dokku-redirect"; the plugin list does not show that plugin).
  - the fallback is `did:web:www.laundryroom.social`, which needs no infra change. but the did is baked into scopes and registrations, so decide once.
- **the document** (served by a next route on the apex). service endpoints point at www, so posts to them never hit the redirect:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:laundryroom.social",
  "service": [
    { "id": "#laundryroom_appview", "type": "LaundryroomAppView", "serviceEndpoint": "https://www.laundryroom.social" },
    { "id": "#laundryroom_spaces", "type": "AtprotoSpaceService", "serviceEndpoint": "https://www.laundryroom.social" }
  ]
}
```

  add a `verificationMethod` (`#atproto` multikey) only if we ever sign outbound service tokens.
- **our own xrpc**: `app/xrpc/[nsid]/route.ts` with `new LexRouter().add(method, { auth: serviceAuth({ audience: 'did:web:laundryroom.social', unique: insertNonceIfAbsent }), handler })` and `export const GET = (req: Request) => router.fetch(req)`.
  - `@atproto/lex-server` is "currently in preview" and handles no cors, so add cors in the route.
  - pds proxying (`atproto-proxy: did:web:laundryroom.social#laundryroom_appview`) checks scopes against `did#serviceId` but sends the bare did as the jwt `aud` (service auth "phase 1"). a later phase may switch to `did#serviceId`.
  - public read methods (`social.laundryroom.getGroup`, `listGroupEvents`, …) come late (phase 8). trpc remains the internal api of our own frontend.

## images

- **uploads** go to the owning repo:
  - people's images through their oauth session (`blob:image/*`; a permission set cannot carry it).
  - group images through the group session.
  - `const { body } = await client.uploadBlob(bytes, { encoding: 'image/webp' })`, then reference `body.blob` in a record within the hour, or the unreferenced blob is garbage-collected.
  - re-encode with sharp first and strip exif/gps.
  - use a route handler, not a server action, because of the 1 mb default body limit.
  - set `PDS_BLOB_UPLOAD_LIMIT` to 10 mib on our pdses (the code default is 5 mib); the record lexicons cap images at 2 mb.
- **public blobs** come from `GET <pds>/xrpc/com.atproto.sync.getBlob?did=&cid=`, with the pds from the did doc. our proxy serves `/img/<preset>/<did>/<cid>`:
  - only for (did, cid) pairs referenced by an indexed **public** record, so it is not an open cdn for arbitrary atproto blobs;
  - always re-encoded;
  - `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`;
  - cached with nginx `proxy_cache`, immutable, and purged on takedown.
  - hotlinking `cdn.bsky.app` (atmo does it) is unofficial bluesky infrastructure; don't.
- **space blobs** are uploaded the same way (`uploadBlob`). public `sync.getBlob` returns `BlobNotFound` for them unless a public record also references the blob. they are served only via `com.atproto.space.getBlob {space, repo, cid}` with a credential, after `access.ts`, as private responses.
- **migration**: existing `group.image` / `user.image` urls on vercel blob are re-uploaded during the group-account and linking backfills. then `BLOB_READ_WRITE_TOKEN` and `@vercel/blob` go.

## phases

each phase deploys on its own. estimates are for one person part-time. there is one environment, production (www.laundryroom.social with real users), plus local dev against the multi-pds dev env. members-only features ship labelled "alpha".

**phase 0: groundwork (1–2 weeks).**
- the leak fixes (`access.ts`, the `pending` role, `migrations/2026-10-03-pending-member-role.sql`): committed 2026-10-03 (8f1b16f); the production migration and deploy wait for the owner. still to add: unit tests for `resolveGroupAccess` (the repo has no tests yet).
- laundryroom-db backups (the open task) and one restore test, on-box until object storage credentials exist.
- the owner buys the domains.
- dns:
  - a records for `@` and `*` of both domains;
  - resend dkim/spf for `lndry.me` and `lndry.social`;
  - the `_acme-challenge` delegation waits for open decision 4.
- the dokku-letsencrypt upgrade (0.20.4 → ≥ 0.25.2) and cert alerting that also watches manually added certs.
- the worker + pg-boss (open task #1).
- the did:web apex fix.
- legal pages: terms, privacy, impressum; the pds env needs their urls.
- `packages/lexicons` (json) and the `packages/atproto` skeleton (`nsid.ts`, `GroupHost`, `GroupContentStore`).
- **a 2–3 day spaces spike on the local dev env**: run bulletin against `dev-env start:multi-pds` at the pinned alpha. it answers five questions:
  - can a simplespace be created with a `group.opensocial.*` type?
  - do stable and alpha `@atproto/*` coexist in pnpm?
  - do `lex build` and `goat lex publish` accept `type: "space"`?
  - does the mixed permission set resolve on bsky.social, and does bsky.social ignore a raw `space:` token rather than refuse it?
  - does a local record's computed cid equal the cid `space.createRecord` returns for the same record and rkey?

*exit*:
- `curl -sI https://laundryroom.social/.well-known/did.json` returns 200 with no redirect;
- a cert with under 21 days left triggers the alert;
- a db restore boots;
- the worker runs a scheduled job;
- the spike has answers to its five questions.

**phase 1: the pdses (1 week).**
- the two wildcard certs (apex + `*` each), issued from the owner's laptop with lego's vercel provider and installed with `dokku certs:add`, plus a calendar reminder for the manual renewal before day 60 (see ops).
- `pds-me` and `pds-social` up on the pinned alpha image (see ops). smtp works through resend on 2465.
- `sqlite3` and `restic` installed; the interim on-box backups of both volumes every 6 h, with rotation.
- the rotation keys and the group-recovery key stored offline; `PDS_RECOVERY_DID_KEY` set on pds-social only.
- the invite pool for lndry.me, for testers only.
- the lexicon account `laundryroom.social` on pds-social; lexicons published; `_lexicon.*` txt records added; `goat lex check-dns` passes.

*exit*:
- an account created through pds-me's sign-up with a pool invite gets its confirmation email;
- `https://alice.lndry.me/.well-known/atproto-did` answers over valid tls, and so does a `*.lndry.social` handle;
- a record created on pds-me appears on the public firehose within a minute;
- an owner test account on pds-me writes into a test space of a test group on pds-social, and the write shows up in `space.listRepos`; both test accounts are deleted afterwards;
- a backup of each pds, restored into a scratch app with no crawlers, boots and serves its accounts. this passes **before the first non-owner account exists**.

**phase 2: atproto login (2 weeks; can start before phase 1).**
- the better auth plugin, the oauth client, the postgres stores and `requestLock`;
- client metadata and jwks routes; the scopes with fallback, including the raw space scopes; `account:email`;
- the reconnect flow; did-first profile urls (`/[handle]`); tap `/repos/add` on sign-in;
- `disableSignUp` on google and magic link; the linking window begins. existing users are the first testers and can ask for a lndry.me invite.
- sign-in works with bsky.social and any other pds from day one, so this phase does not wait for phase 1. "create a lndry.me account" (`prompt=create` with a pool invite) is switched on once pds-me exists.

*exit*:
- sign-in works from bsky.social, lndry.me and bluesky's hosted alpha pds;
- the session knows whether the space scopes were granted (`allowsSpace`): yes on lndry.me, no on bsky.social;
- a tester with no account gets from a qr code to signed in as `name.lndry.me` on a phone in under 3 minutes, invite copy included;
- an existing magic-link user links a did and keeps their groups;
- a forced concurrent refresh in web and worker does not revoke the session;
- a broken `include:` falls back to raw scopes;
- a handle change on lndry.me shows up within a minute.

**phase 3: group accounts (1–2 weeks).**
- `LocalPdsGroupHost` and `group_credential`;
- accounts for every existing group (foodiespace first), with a readable handle if active and an opaque one otherwise; their `rotationKeys` include the group-recovery key;
- for active groups, the public `social.laundryroom.group.profile` and group images as blobs;
- the meta and members simplespaces with the opensocial records, the `putMember` mirror (every member, whatever their pds) and the daily reconcile;
- `group.write` jobs for every profile edit.

*exit*:
- `foodiespace.lndry.social` resolves and its profile shows on pdsls.dev;
- an admin's edit lands as a record within a minute, and a non-admin's attempt is refused in trpc;
- `plc.directory/<did>/data` lists the rotation keys in the planned order, the group-recovery key included;
- a custody drill succeeds: delete the stored credential, recover with admin `updateAccountPassword`;
- `simplespace.listMembers` on foodiespace's members space matches `group_member`;
- private, hidden and nsfw groups have nothing public except their opaque handle.

**phase 4: public meetups and interop (2 weeks).**
- tap, the indexer and the index tables;
- meetups of active groups → group-authored `community.lexicon.calendar.event` mirrors;
- the existing upcoming meetups backfilled under 2,600 events/h;
- rsvps stay in postgres (members-only) until phase 6, plus an opt-in public `community.lexicon.calendar.rsvp`;
- other apps' rsvps on our mirrors are indexed;
- ics and og keep working; the discovery feed only if open decision 7 says so.

*exit*:
- an upcoming foodiespace meetup appears on atmo.rsvp / openmeet;
- an rsvp given there shows in laundryroom (count for everyone, name for members);
- a cancellation propagates;
- a jetstream filter on a private group's did shows zero records;
- dropping the index tables and re-syncing produces the same pages.

**phase 5: spaces-backed discussions in production, for everyone (3 weeks).**
- the spaces adapter on the pinned alpha, with `SpacesStore` and `LocalRecordStore`;
- a forum space per group, with `putMember` from `group_member`;
- members on a spaces-capable pds write threads and replies into their space repos through their oauth space scope; everyone else writes local records. the board is labelled "alpha", and every post says where it is stored;
- `registerNotify` and the notify routes; the syncer; the index; read enforcement through `access.ts`;
- removal labels;
- the existing discussions and comments move off the postgres tables. members with a granted space scope get space records written through their sessions; everyone else gets local records; `createdAt` is preserved. posts of unlinked legacy users stay read-only as "former member";
- the lift job (local → space), tested on the dev env even while few members can use it;
- fixtures, `pnpm dev:seed`, contract tests, the thursday routine.

*exit*:
- in foodiespace, a member on lndry.me (space record) and a member on bsky.social (local record) post and reply, and see each other's posts within 5 s (notify) or 5 min (catch-up);
- the developer account on bluesky's hosted alpha pds posts in a private test group, and the post syncs;
- an anonymous visitor, a signed-in non-member and a banned member get nothing from the appview, for space and local records alike;
- the banned member's new space write is refused at `notifyWrite`, and a new local write is refused in trpc;
- on the dev env, a lifted local record keeps its uri and cid;
- one thursday release is absorbed, backup first, with changes only under `packages/atproto/src/spaces/`.

**phase 6: everything else on spaces (3–4 weeks).**
- the calendar space: canonical events, eventInfo, rsvps in members' space repos (local records for members without spaces), pledge boards/items/fulfillments;
- the staff space for hidden meetups;
- the waitlist (computed, plus the optional attendance record);
- join requests and approvals; roles and the permissions records; bans;
- llm moderation → `!hide` labels;
- status transitions (policy updates, mirrors added or removed, handle swaps);
- space images through `space.getBlob`;
- deleting a group (`deleteSpace` → `notifySpaceDeleted` → purge, then deactivate the account);
- the existing meetups, rsvps and pledges move like the discussions did, and the legacy content tables become read-only.

*exit*:
- no content table is read on any request path;
- active → private → active leaves no public record of the private period;
- dropping the index (except `source = local` rows) and re-syncing from the network gives identical pages;
- one e2e script on the dev env exercises every flow.

**phase 7: the ga move (once spaces ga ships in the reference pds; 2–3 weeks).**

why a move and not an upgrade: the alpha's account-db migration `008-spaces` clashes with main's `008-account-email-auth-factor`, and its actor migrations 002–004 do not exist on main (kysely, no unordered migrations). an alpha volume will therefore probably not boot a production image. this is inferred from code and untested. if the ga notes do offer an upgrade path from the alpha, test it on a restored backup and prefer it.

the exact goat/xrpc steps are researched and rehearsed before ga. every step below is *unverified* until then.

1. **prepare.** read the ga notes. move `@atproto/*` to ga versions, port the adapter to the final wire format, and publish final lexicons (renaming the group nsids if the working group renamed them).
2. **fresh ga pdses.** new dokku apps with new volumes and new rotation keys, and `PDS_RECOVERY_DID_KEY` on the group one only.
   - give each a service hostname that can never be a handle. a two-label name such as `pds.v2.lndry.me` can never be a single-label handle (it needs its own non-wildcard cert); a label like `pds2` could already belong to a person. reusing `pds.lndry.me` is a variant to try in the rehearsal.
   - the relay then sees a new host (or, with a reused hostname, a firehose that starts over): request a crawl, and the raised limits.
3. **rehearse** the whole move on restored backups, in scratch apps with no crawlers. plc operations cannot be rehearsed on real dids without really moving them, so rehearse the identity step against the dev env's local plc, or on throwaway accounts created on the real pdses for the purpose.
4. **one maintenance window per pds**: groups first, then people, a few dozen accounts each. writes for that pds's accounts are paused in laundryroom.
5. **per account**, the standard account migration. `goat account migrate` runs these steps for an account whose password you hold.
   - `createAccount` on the new pds with the existing did. it needs a service-auth jwt from the did's current signing key (`getServiceAuth` on the old pds, `lxm = com.atproto.server.createAccount`). admin auth does not stand in for it: `createAccount.ts` requires the requester to be that did. we hold the groups' master passwords. we don't hold people's, so the rehearsal picks one of three ways:
     - the person runs the move with their own password;
     - an admin password reset on the old pds (`updateAccountPassword`, which revokes their sessions);
     - the documented fallback: a plc operation, signed with the old pds's rotation key, that points the did at a signing key the operator holds, which then mints the token.
   - export and import: `sync.getRepo` → `repo.importRepo`; `sync.listBlobs` + `sync.getBlob` → `repo.uploadBlob` (check with `listMissingBlobs`); `app.bsky.actor.getPreferences` → `putPreferences`; then `checkAccountStatus`.
   - identity: `getRecommendedDidCredentials` on the new pds, then a plc operation **signed with the old pds's rotation key**. that key is in every account's `rotationKeys`, because that pds created the account. the operation sets the new signing key and endpoint, and the rotation keys [owner key if any, the group-recovery key for groups, the new pds key], with the old pds key removed. the tools are `goat plc update` and `goat plc sign --plc-signing-key`, then `submitPlcOperation` through the new pds. this is operator-driven and needs no email token.
   - `activateAccount` on the new pds, `deactivateAccount` on the old one.
   - passwords do not move: people set one on the new pds through its reset email.
6. **handles.** `*.lndry.me` and `*.lndry.social` are answered by whichever pds serves the wildcard. so at the end of the window, the apex and wildcard domains (and their certs) move from the old app to the new one in nginx (`dokku domains`, `certs:add`). handles do not change.
7. **re-create space data from the index.** the alpha can export a space repo (`space.getRepo`), but no pds can import one.
   - `createSpace`, `putMember` and `registerNotify` for every group space on the new pds-social;
   - group-authored records with the custodied group credentials;
   - member-authored records through members' oauth sessions after they sign in again (the authorization server changed, so the old sessions are dead), same rkey, `createdAt` preserved. until a member signs in, their records are served from the index as local records.
   - members on pdses we don't run keep their space repos where they are. whether the new space host learns about them before their next write is *unverified*.
8. **close.** keep the old volumes, root-only, until the checks pass, then delete them. tap needs no change (same dids).

if spaces ga ships before phase 5, do this move first, while the spaces hold only the meta and members data.

*exit*:
- every account resolves to a ga pds (`plc.directory/<did>/data`), with handles unchanged and the old pds keys gone from `rotationKeys`;
- foodiespace's discussions, rsvps and pledges are space records on the ga pdses, or local records waiting for their author;
- the rebuild-from-network drill passes on the ga pdses;
- the alpha pds apps are gone.

**phase 8: cleanup (1 week).**
- retire vercel blob, the legacy auth code and the `/auth/confirm` page; drop the legacy content tables;
- move trpc read paths that duplicate xrpc onto shared code; public xrpc read methods;
- propose the calendar space type and the pledge lexicons at lexicon.community;
- revisit the lndry.me sign-up policy now that the alpha is over.

## ops prerequisites

| item | why | how | by |
|---|---|---|---|
| laundryroom-db backups | none exist on the box, and local records live only there | interim: `dokku postgres:export laundryroom-db` every 6 h into a root-only directory, with rotation. once hetzner object storage credentials exist: `dokku postgres:backup-auth laundryroom-db …` + `backup-schedule "0 3 * * *" <bucket>`. a restore test either way | phase 0 |
| pds backups | the volumes hold people's and groups' identities (per-account sqlite + signing keys) and members-only space data. they must exist before the first non-owner account | `apt install sqlite3 restic` (neither is on the box). every 6 h: `sqlite3 .backup` of `account.sqlite`, `sequencer.sqlite`, `did_cache.sqlite` and of each `actors/<xx>/<did>/store.sqlite`, then a tar of `actors/` (keys + those copies) and `blocks/`, kept on-box root-only with rotation (e.g. 7 days). once object storage credentials exist, restic offsite. run by hand before every thursday bump. restore drill into a scratch app with an empty `PDS_CRAWLERS`. | phase 1 |
| key inventory | losing a rotation key loses recovery | offline copies: pds rotation key hex (each pds), group-recovery k256 private key, lexicon account password, `ATPROTO_OAUTH_KEY_1`, `GROUP_CREDENTIAL_KEY_1` | phase 1 |
| tls, stopgap | every `*.lndry.me` / `*.lndry.social` handle needs a valid wildcard cert (the pds answers `/.well-known/atproto-did` by host header), and phase 1 does not wait for open decision 4 | on the owner's laptop, with a short-lived vercel token that never touches the box: `VERCEL_API_TOKEN=… VERCEL_TEAM_ID=… lego --email <owner address> --dns vercel -d lndry.me -d '*.lndry.me' run` (lego v4 syntax; the same for `lndry.social`). then `tar cf - -C .lego/certificates lndry.me.crt lndry.me.key \| ssh dokku@falkenstein certs:add pds-me`. renew by hand before day 60 (`lego … renew`, then `certs:update`), with a calendar reminder. the letsencrypt cron never renews `certs:add` certs, so never `letsencrypt:enable` these apps. replace the stopgap before 2027-02-10, when lifetimes drop to 64 days (45 from 2028-02-16). whether lego's vercel provider works for these zones is *unverified* until the first run. | phase 1 |
| tls, on the box | renewals must be automatic before lifetimes shrink | first upgrade dokku-letsencrypt to ≥ 0.25.2: 0.20.4 writes dns credentials into a `chmod 0755` `docker.env`, and ≥ 0.24.0 has `lego-docker-options` for file-mounted secrets. then, per open decision 4: **desec**: cname `_acme-challenge.{lndry.me,lndry.social}` to a desec zone, with a token policy limited to those txt names and `allowed_subnets=167.235.249.248/32`; then `letsencrypt:set <app> dns-provider desec`, `lego-docker-options "-v /etc/dokku-secrets/desec-token:/secrets/desec:ro"`, `dns-provider-DESEC_TOKEN_FILE /secrets/desec`. **acme-dns**: run joohoi/acme-dns on the box on udp/tcp 53 of the public ip (check what holds port 53 today, and open it in the firewall); delegate e.g. `acme.lndry.social` with an ns record plus an a record for its nameserver in vercel dns (*unverified* that vercel dns takes ns records for a subdomain); cname each `_acme-challenge` to the subdomain that `/register` returns; then lego's `acme-dns` provider with `ACME_DNS_API_BASE` and a mounted `ACME_DNS_STORAGE_PATH`. its credentials can only update their own txt record. keep the delegation labels out of group slugs: every label under `lndry.social` is a would-be handle. **dedicated vercel team**: a team-scoped, expiring token, mounted as `VERCEL_API_TOKEN_FILE`. in every case, one cert per app with apex + wildcard only, because one failing name fails the whole order. | before day 60 of the stopgap |
| cert alerting | renewals already fail silently (zettelwirtschaft has failed daily since ~2026-09-29), the stopgap certs never renew themselves, and let's encrypt lifetimes drop to 64 days on 2027-02-10 and 45 on 2028-02-16 | a daily dokku cron that checks `notAfter` for every app domain (`openssl s_client`) and emails or pushes when it is under 21 days | phase 0 |
| relay limits | 100 accounts, 2,600 events/h, 21,000/day per new host | ask bluesky to raise pds.lndry.social before ~80 groups. batch backfills under the hourly budget. the ga pdses (phase 7) are new hosts: request a crawl and the limits again. | phase 3 |
| pds config | | see below | phase 1 |
| smtp | hetzner blocks outbound 25 and 465; a misconfigured smtp fails silently | `PDS_EMAIL_SMTP_URL=smtps://resend:<key>@smtp.resend.com:2465`, verified sending domains, and a test delivery | phase 1 |
| dokku app settings | two pds containers must never share a sqlite volume; websockets need long timeouts; the image runs as uid 1000 | `checks:disable` on pds apps; nginx `client-max-body-size 12m`, `proxy-read-timeout 3600s`, `proxy-send-timeout 3600s`, then `proxy:build-config`. storage `--chown heroku` (= `1000:1000`, the image's `node` user) | phase 1 |
| monitoring | | `/xrpc/_health` of every pds and tap's `/health` in the existing uptime checks; disk usage of the pds volumes | phase 1 |
| legal and abuse | hosting accounts makes us an account host (gdpr controller; hosting-provider duties). *not legal advice; check* | terms of service, privacy policy, impressum, an abuse contact (`PDS_CONTACT_EMAIL_ADDRESS`), a minimum age, a takedown procedure (admin `com.atproto.admin.updateSubjectStatus`), and an account deletion path. reports from bluesky's app go to `PDS_REPORT_SERVICE` (bluesky's moderation), but takedowns on our pds are ours. | phase 0–1 |
| dns hygiene | the laundryroom.social zone on vercel (thefoodiespace) also holds the proton mail records | never `vercel domains rm`; new txt records are added one by one | always |

pds config (pds-me shown; pds-social differs in hostname, handle domain, from-address, `PDS_RECOVERY_DID_KEY` and the bypass key). both run the same pinned alpha image. it is built from the atproto monorepo's `services/pds/Dockerfile` (node 24 alpine, `USER node`, `EXPOSE 3000`, `VOLUME /app/data`), not from the pds distribution: there is no installer, no `pdsadmin` and no goat inside, so admin calls go over xrpc with curl, or with goat from the laptop.

```
dokku apps:create pds-me
dokku storage:ensure-directory --chown heroku pds-me   # 1000:1000 for the image's USER node (storage:create on newer dokku)
dokku storage:mount pds-me /var/lib/dokku/data/storage/pds-me:/app/data   # the path the image declares as VOLUME
dokku checks:disable pds-me
dokku git:from-image pds-me ghcr.io/bluesky-social/atproto:pds-79d6307e19908f3af406838ea0e5fae42847f182
dokku config:set --no-restart pds-me \
  PDS_HOSTNAME=pds.lndry.me PDS_SERVICE_HANDLE_DOMAINS=.lndry.me \
  PDS_DATA_DIRECTORY=/app/data PDS_BLOBSTORE_DISK_LOCATION=/app/data/blocks PDS_BLOB_UPLOAD_LIMIT=10485760 \
  PDS_JWT_SECRET=$(openssl rand --hex 16) PDS_ADMIN_PASSWORD=$(openssl rand --hex 16) PDS_DPOP_SECRET=$(openssl rand --hex 32) \
  PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX=$(openssl ecparam --name secp256k1 --genkey --noout --outform DER | tail --bytes=+8 | head --bytes=32 | xxd --plain --cols 32) \
  PDS_DID_PLC_URL=https://plc.directory \
  PDS_BSKY_APP_VIEW_URL=https://api.bsky.app PDS_BSKY_APP_VIEW_DID=did:web:api.bsky.app \
  PDS_REPORT_SERVICE_URL=https://mod.bsky.app PDS_REPORT_SERVICE_DID=did:plc:ar7c4by46qjdydhdevvrndac \
  PDS_CRAWLERS=https://bsky.network PDS_INVITE_REQUIRED=true PDS_RATE_LIMITS_ENABLED=true \
  PDS_EMAIL_SMTP_URL=smtps://resend:<RESEND_API_KEY>@smtp.resend.com:2465 PDS_EMAIL_FROM_ADDRESS=noreply@lndry.me \
  PDS_CONTACT_EMAIL_ADDRESS=<abuse address> \
  PDS_PRIVACY_POLICY_URL=https://www.laundryroom.social/en/pages/privacy \
  PDS_TERMS_OF_SERVICE_URL=https://www.laundryroom.social/en/pages/terms
# pds-social additionally: PDS_RECOVERY_DID_KEY=did:key:<group-recovery pubkey> PDS_RATE_LIMIT_BYPASS_KEY=$(openssl rand --hex 32)
# never PDS_RECOVERY_DID_KEY on pds-me
dokku domains:set pds-me lndry.me '*.lndry.me'
dokku nginx:set pds-me client-max-body-size 12m
dokku nginx:set pds-me proxy-read-timeout 3600s && dokku nginx:set pds-me proxy-send-timeout 3600s
dokku proxy:build-config pds-me
# from the laptop (stopgap tls): tar cf - -C .lego/certificates lndry.me.crt lndry.me.key | ssh dokku@falkenstein certs:add pds-me
```

`PDS_DPOP_SECRET` (64 hex characters) keeps dpop nonces valid across restarts. left unset, the pds draws a random one at every start (`config/env.ts` and `oauth-provider/src/dpop/dpop-nonce.ts` on the alpha branch). smoke test: `curl https://pds.lndry.me/xrpc/_health` and `wsdump "wss://pds.lndry.me/xrpc/com.atproto.sync.subscribeRepos?cursor=0"`. the pds readme sizes 1 gb ram, 1 core and 20 gb ssd for 1–20 users, so two instances are small change on this box. the alpha image's idle footprint is not measured.

## risks and how we hold them

- **real data on software bluesky says not to run in production.** the alpha blog says "do not use it in production", "we strongly recommend that you do not migrate your real accounts to this version" and "the code has not undergone careful security review". the alpha image is pds 0.5.32, five patch versions behind 0.5.37, so it may miss security fixes. → the owner's decision (decisions 7–8), held by the guardrails: invite-only lndry.me, alpha labels that say not to post anything sensitive, backups, the group-recovery key, weekly bumps.
- **weekly breaking alpha releases, now on real data.** the repo serialization / commit format change is expected around 2026-10-08..15, plus an hmac nonce change. the uri scheme, did-document semantics and public spaces are still open, and "database schemas may change without clean migrations". → the adapter boundary, exact pins, the thursday routine with a backup first, rollback = previous image + restore, and the phase-7 move procedure as the way out of a release that cannot carry data. the first space data arrives in phase 3, by which time the serialization change has probably shipped.
- **no upgrade path from alpha to ga.** the "008" migration-name clash and the actor migrations 002–004 (kysely, no unordered migrations) mean an alpha-run volume will probably not boot a production image. this is inferred from code, not tested. → the ga move (phase 7): fresh pdses, standard account migration, space data re-created from the index, rehearsed first.
- **the ga move touches every identity we host.** plc operations signed with the old pds's rotation key move people's dids without their own action, and a mistake there can lock an account out for good. people also need a new password, and their oauth sessions die. → rehearse on restored backups and against a local plc first; groups before people; one account end to end before the rest; tell testers in advance.
- **space data does not move.** no pds can import a space repo. → the index holds enough to re-create every space record. member-authored records wait for their author's next sign-in and are served as local records meanwhile.
- **bsky.social without spaces.** production pdses (bsky.social) do not serve spaces, and their oauth server grants no `space:` scope. → local records, lifted later. a member may wait months, and lifting needs a new sign-in.
- **local records are not on the network.** they fail the rebuild test, other apps cannot see them, and replies to them dangle until they are lifted. → laundryroom-db backups, a ui that says where each post is stored, and lifting as soon as the member's pds can.
- **ga may refuse app-password writes to spaces.** the spec says writes and simplespace management take "only an oauth credential". the alpha accepts legacy bearer and app-password sessions. if ga enforces the spec, custodied group writes stop working, and a reference pds has no server-side way to hold an oauth session for a group account. → `GroupHost` interface; watch for bluesky's group host or a nested-oauth pds (tranquil does account delegation, but no spaces yet).
- **opensocial churn.** the draft is unpublished, the name is undecided, actions may become nsids, crud methods may go, the label may move. → one constants module, no enums, a re-write job for the group-authored records.
- **unpublished opensocial declarations break logins** if any `space:group.opensocial.*` scope is requested (`invalid_scope` for the whole par). → never request them. acceptance and invites wait.
- **the lexicon account is a login dependency.** the space type declarations must resolve at every authorization. if pds-social or the `_lexicon` dns is down, every login asking for space scopes fails. → the lexicon account sits on a backed-up pds, the raw-scope fallback stays, and monitoring covers it.
- **custody is a single point of compromise.** the group credentials, the encryption key and the pds-social admin password all live on one box. → separate keys per purpose, the recovery key offline, pds-me admin never in laundryroom, owner rotation keys offered at group creation.
- **the relay cap.** group number 101 on pds.lndry.social becomes `host-throttled`, and its public records stop being relayed. → ask early; separate hosts; direct taps.
- **read enforcement bugs are leaks.** the appview must reproduce `access.ts` exactly over the index (discourse 1257). → one function, unit tests per status × role, the leak table above as a test checklist.
- **removal lag.** credentials last up to 10 min, the reference pds never sends `notifyCredentialRevoked`, and removed repos stay in `listRepos`. → filter at read time; refusals at `notifyWrite`.
- **tap is beta.** the 0.1.10 image predates the september hardening. → build from a pinned commit; its own database; idempotent handlers.
- **better auth internals.** `createOAuthUser`, `linkAccount` and `setSessionCookie` can drift between 1.7 and 1.8, and pr #9565 may never merge. → the plugin is ~150 lines of our own code with a test.
- **refresh races.** without `requestLock`, single-use refresh tokens get the session revoked. → the advisory lock from day one.
- **certificates.** an expired wildcard makes every handle on that domain invalid, and the stopgap certs renew only by hand. → the calendar reminder, alerting under 21 days, the plugin upgrade, and open decision 4 settled before 2027-02-10.
- **the image proxy** could become an open cdn for arbitrary blobs, or leak space blobs. → only indexed public references; space blobs only on the private path.
- **solo-developer load.** two pdses on an alpha, an appview, real users and weekly churn. → one stack instead of a parallel testbed, scripted backups and rollback, and a rule: if a week's alpha break costs more than a day, stay on the previous pin until the next release rather than chase it.
- **bluesky's ask.** no *public launch* of production features on spaces before ga. "public work which is labeled alpha is fine", but users must not assume their data rolls forward automatically (discourse 1223). → every members-only feature is labelled alpha and says storage may change; no launch announcement before ga; no pressure on pds operators.

## open questions to verify at implementation time

- does `simplespace.createSpace` accept `group.opensocial.*` space types without resolving their (unpublished) declarations? (atmo-events says yes; phase-0 spike)
- do stable `@atproto/*` 0.5.x/0.3.x and the alpha snapshot coexist in one pnpm workspace?
- do `@atproto/lex` 0.3.14, `lex build` and goat v0.2.5 accept `type: "space"` and `resource: "space"`?
- does the mixed permission set (repo + space entries) resolve on bsky.social, and does bsky.social ignore raw `space:` tokens? (inferred yes from main's `include-scope.ts` and `request-manager.ts`)
- does a local record's computed cid match the cid the pds assigns when it is lifted with the same rkey?
- does lifting need a fresh oauth authorization once a member's pds gains spaces, and how is the member asked without pressuring their host?
- will a given thursday release migrate existing alpha data, or need a rebuild? (read each release's migration prompt before bumping)
- can the pds oauth sign-up ui take a prefilled invite code?
- does tap's `TAP_FULL_NETWORK=true` against a single pds work end to end, and how does it recover when its cursor is older than the pds's firehose retention?
- how is the apex 301 configured on falkenstein today (nginx include, plugin, or app)?
- does lego's vercel provider issue the wildcard certs for lndry.me and lndry.social from the laptop as expected?
- for open decision 4: does lego's desec provider work with a token policy limited to `_acme-challenge` txt names (and what is the exact policy json)? does vercel dns accept the ns delegation acme-dns needs, and is port 53 free on the box?
- the ga move: does the ga pds accept repos exported from the alpha? how is the `createAccount` service-auth token obtained for people? can preferences move without the person's session? does a new space host learn about member repos on foreign pdses before their next write? is reusing the `pds.lndry.me` hostname simpler than a new one?
- will ga still accept app-password writes to spaces?
- when will bsky.social serve `com.atproto.space.*`?
- the final group nsid (`opensocial.group` vs `intermodal.group`) and whether bluesky publishes its group host.
- whether `app.bsky.actor.profile` on group accounts (so other apps show a name and avatar) is wanted: it makes groups look like bluesky accounts.
- the oauth ui's self-service account deletion on the reference pds.

## sources

**spaces (permissioned data)**
- https://atproto.com/blog/atproto-spaces-alpha (2026-08-20) · https://github.com/bluesky-social/proposals/tree/main/0016-permissioned-data (0c9c2e8, 2026-10-01)
- https://github.com/bluesky-social/atproto/tree/permissioned-data-alpha (79d6307e1, 2026-10-01): `lexicons/com/atproto/{space,simplespace}/`, `packages/space/src/{credential,http-signature}.ts`, `packages/pds/src/{simplespace/manager.ts,space-notifications.ts,auth-verifier.ts,auth-scope.ts}`, `packages/oauth/oauth-scopes/src/scopes/{space-permission,include-scope}.ts`, `packages/pds/src/account-manager/db/migrations/008-spaces.ts`, `packages/pds/src/actor-store/db/migrations/004-space-sync.ts`
- https://github.com/bluesky-social/atproto/pull/5569 (dpop → http message signatures) · issues https://github.com/bluesky-social/atproto/issues/5508 (closed 2026-09-18) · /5509 · /5462
- images: https://ghcr.io/v2/bluesky-social/atproto/manifests/pds-spaces-alpha · `ghcr.io/bluesky-social/atproto:pds-79d6307e19908f3af406838ea0e5fae42847f182` · `.github/workflows/build-and-push-pds-ghcr.yaml`, `services/pds/Dockerfile`
- hosted alpha pds: https://spaces-alpha.host.bsky.network/xrpc/com.atproto.server.describeServer
- discourse: https://discourse.atmosphere.community/t/atproto-spaces-alpha-updates/1129 · /t/permissioned-data-spaces-protocol-timeline/1223 · topics 944, 1257, 1261, 1278
- alpha cautions: the blog's "remember, this is an alpha" section · bluesky's launch ask: https://discourse.atmosphere.community/t/permissioned-data-spaces-protocol-timeline/1223 (posts #1 and #3, 2026-09-09) · on the alpha branch: `packages/pds/src/config/env.ts` (`PDS_DPOP_SECRET`, `PDS_RECOVERY_DID_KEY`), `packages/oauth/oauth-provider/src/dpop/dpop-nonce.ts`, `packages/pds/src/actor-store/actor-store.ts` (on-disk layout), `lexicons/com/atproto/space/{createRecord,applyWrites,getRepo}.json`
- reference app: https://github.com/bluesky-social/bulletin (3428660; `lib/atproto/space-credential.ts`, `lib/sync/engine.ts`, `lib/sync/service-auth.ts`, `app/.well-known/did.json/route.ts`)
- others: https://github.com/flo-bit/contrail/pull/95 · happyview (tangled.org/gamesgamesgamesgames.games/happyview, v2.16) · https://github.com/malpercio-dev/ezpds/pull/661

**groups**
- https://tangled.org/opensocial.group/proposal (d2c89a9744afad46ce815e507164550935f14ad1, 2026-09-29; issues #1–#14) · the original google doc https://docs.google.com/document/d/1VS-nY2EyfXFT7ovu3uMeftbgz_PiHMrb52tLCTbPcE0
- group host: https://bnewbold.leaflet.pub/3mw5al7ocuk2t (2026-09-22) · https://discourse.atmosphere.community/t/group-host-concept/1277
- working group: https://discourse.atmosphere.community/t/atmospheric-groups-wg-next-steps-september-2026/1269 · /t/atmospheric-group-terminology-and-nsid/1268 · /t/website-for-opensocial-group/1308 · /t/next-wg-meeting-september-30th/1283 · /t/opensocial-community-proposal/1124 · /t/what-is-an-atmospheric-group-community/906
- implementations: https://github.com/tompscanlan/atmo-events/tree/feat/groups-opensocial (`apps/web/src/lib/groups/`) · https://opensocial.fyi (fyi.opensocial.* fork) · https://github.com/grainsocial/grain · https://github.com/hatk-dev/hatk/blob/main/docs/spaces-appview.md · https://github.com/habitat-network/habitat · https://github.com/muni-town/arbiter · https://discourse.atmosphere.community/t/arbiter-workaround-providing-virtual-oauth-scopes-for-delegated-accounts/1256 · https://discourse.atmosphere.community/t/tranquil-account-delegation-status-and-what-weve-learned/1188 · https://discourse.atmosphere.community/t/sketching-com-atproto-server-createactorauth/1140
- earlier groups proposal (superseded): https://bnewbold.leaflet.pub/3me3ea64bhk26 · bluesky communities: https://techcrunch.com/2026/06/11/bluesky-launches-group-chats-as-company-shifts-focus-to-community-features/

**oauth, identity, app stack**
- https://atproto.com/specs/oauth · https://atproto.com/guides/oauth-patterns · https://atproto.com/specs/permission · https://atproto.com/blog/oauth-improvements
- https://github.com/bluesky-social/atproto/tree/main/packages/oauth (oauth-client-node 0.5.9 changelog, `oauth-provider/src/client/client-manager.ts`, `request/request-manager.ts`, `oauth-provider-ui/src/components/forms/fields/handle-field.tsx`)
- https://github.com/bluesky-social/statusphere-example-app (dbb9773) · leaflet `src/atproto-oauth.ts`, `app/api/oauth/[route]/`, `app/api/atproto_images/route.ts` (hyperlink-academy/leaflet @9424136) · https://github.com/flo-bit/atmo-events (ed2fb42) · frontpage `apps/frontpage/lib/auth.ts`
- better auth: https://github.com/better-auth/better-auth/pull/9565 · https://github.com/better-auth/better-auth/issues/7953 · npm `atproto-better-auth`, `better-auth-atproto`
- identity lifecycle: https://atproto.com/specs/handle · https://atproto.com/specs/did · https://atproto.com/specs/sync · https://atproto.com/guides/account-lifecycle · https://atproto.com/specs/account · `packages/identity/src/did/web-resolver.ts` · https://web.plc.directory/spec/v0.1/did-plc
- lexicons: https://atproto.com/specs/lexicon · https://atproto.com/guides/publishing-lexicons · https://atproto.com/guides/data-validation · https://atproto.com/specs/blob · `packages/lex/lex/README.md` · https://github.com/bluesky-social/goat (v0.2.5) · https://tangled.org/lexicon.community/lexicons · https://lexicon.community/
- xrpc: https://atproto.com/specs/xrpc · `packages/lex/lex-server/README.md` · `packages/pds/src/pipethrough.ts` · https://api.bsky.app/.well-known/did.json

**pds hosting and ops**
- https://github.com/bluesky-social/pds (README, installer.sh, releases: 0.4.5037) · `packages/pds/src/{handle/index.ts,handle/reserved.ts,api/com/atproto/server/createAccount.ts,rate-limits.ts,config/env.ts}`
- https://openmeet.net/running-a-pds-for-your-app · https://atproto.com/guides/self-hosting · https://atproto.com/blog/network-account-management
- account migration: https://atproto.com/guides/account-migration · https://github.com/bluesky-social/pds/blob/main/ACCOUNT_MIGRATION.md · goat `account_migrate.go`, `plc.go`, `pds_admin.go` · `packages/pds/src/api/com/atproto/server/{createAccount,getServiceAuth}.ts`
- relay limits: https://bsky.network/docs/rate-limits/ · indigo `cmd/relay/relay/{slurper,account}.go`
- tls: https://github.com/dokku/dokku-letsencrypt (0.20.4 → 0.25.2; `internal-functions`; release 0.24.0) · https://go-acme.github.io/lego/dns/vercel/ · lego v4.35.2 `platform/config/env/env.go` · https://desec.readthedocs.io/en/latest/auth/tokens.html · https://letsencrypt.org/2025/12/02/from-90-to-45 · https://community.letsencrypt.org/t/dns-persist-01-deployment-status-and-timeline/246468 · https://vercel.com/docs/accounts/access-tokens · https://vercel.com/docs/domains/working-with-domains/transfer-your-domain · https://go-acme.github.io/lego/dns/acmedns/ · https://github.com/joohoi/acme-dns
- dokku: https://github.com/dokku/dokku/blob/master/docs/advanced-usage/persistent-storage.md · /docs/deployment/zero-downtime-deploys.md · /docs/configuration/ssl.md · `plugins/nginx-vhosts/templates/nginx.conf.sigil`
- smtp: https://resend.com/docs/send-with-smtp

**ingestion**
- https://github.com/bluesky-social/indigo/blob/main/cmd/tap/README.md (tap-v0.1.10 = 4f47add; main b2619d8) · https://github.com/bluesky-social/atproto/blob/main/packages/tap/README.md · https://bsky.network/docs/jetstream/ · https://github.com/bluesky-social/jetstream/releases

**carried over from the 2026-09-13 plan and still valid**
- rate limits: https://docs.bsky.app/docs/advanced-guides/rate-limits
- smoke signal: https://tangled.org/smokesignal.events/smokesignal · https://blog.smokesignal.events/posts/3lthgjbbhyk2c-community-lexicons · https://blog.smokesignal.events/posts/3lvbownlrme2a-atprotocol-record-references-authoritative-vs-unauthoritative-patterns
- openmeet and atmo: https://openmeet.net/your-identity-your-events · https://openmeet.net/cross-app-authentication-atproto · https://github.com/flo-bit/atmo-events/issues/78
- appviews and moderation: https://atproto.com/blog/2026-spring-roadmap · https://atproto.com/guides/statusphere-tutorial · https://atproto.com/specs/label · https://github.com/bluesky-social/atproto/discussions/2961 · https://github.com/bluesky-social/atproto/discussions/4795 · https://zicklag.leaflet.pub/3mjrvb5pul224 · https://meri.leaflet.pub/3mj4qwvypq22a
- ecosystem: https://techcrunch.com/2026/08/11/blueskys-active-user-base-is-shrinking-as-its-focus-expands-beyond-the-app/ · https://sifa.id/stats
