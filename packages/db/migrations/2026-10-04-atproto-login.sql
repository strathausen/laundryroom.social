-- sign in with an atproto account, 2026-10-04
--
-- run this ONCE against the live database BEFORE deploying the code that signs
-- people in with atproto (the old code keeps working after it has run: it
-- never reads the new columns and tables):
--
--   psql -v ON_ERROR_STOP=1 "$POSTGRES_URL" -f packages/db/migrations/2026-10-04-atproto-login.sql
--
-- on the dokku box, where the database has no exposed port, pipe it through
-- the postgres plugin instead:
--
--   ssh falkenstein 'dokku postgres:connect laundryroom-db' < packages/db/migrations/2026-10-04-atproto-login.sql
--
-- (ON_ERROR_STOP matters: without it psql carries on after a failed
-- statement, the COMMIT at the end silently becomes a ROLLBACK and psql still
-- exits 0, so an aborted run looks like a successful one. postgres:connect
-- takes no psql flags, hence the \set below as well; it is a psql command,
-- so run this file with psql, not with another client)
--
-- what it does
--   user                   gains did (unique), handle and contact_email, all
--                          nullable: the atproto identity, the last verified
--                          handle, and the confirmed email the person's pds
--                          shared (where mail goes, never used to find or
--                          link accounts)
--   atproto_oauth_state    pending atproto sign-ins (encrypted, swept after
--                          an hour by the app)
--   atproto_oauth_session  one oauth session per did (encrypted: it holds the
--                          dpop key and the refresh token)
--
-- no data changes: existing users get null in the new columns. idempotent:
-- every statement checks first (IF NOT EXISTS), so a re-run is a no-op. one
-- transaction, so a failure leaves nothing half-done.
--
-- the definitions mirror packages/db/src/schema.ts exactly (types, defaults,
-- index and constraint names), so `pnpm --filter @laundryroom/db push`
-- reports no changes afterwards.

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "did" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "handle" text;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "contact_email" text;

-- one did, one user. nulls do not collide (every existing user has none)
CREATE UNIQUE INDEX IF NOT EXISTS "user_did_idx" ON "user" USING btree ("did");

CREATE TABLE IF NOT EXISTS "atproto_oauth_state" (
  "key" text NOT NULL,
  "value" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "atproto_oauth_state_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "atproto_oauth_session" (
  "did" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "atproto_oauth_session_pkey" PRIMARY KEY ("did")
);

COMMIT;
