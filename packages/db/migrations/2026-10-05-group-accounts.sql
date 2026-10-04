-- group accounts on lndry.social (phase 3 of docs/atproto-plan.md), 2026-10-05
--
-- run this ONCE against the live database BEFORE deploying the code that
-- creates group accounts (the old code keeps working after it has run: it
-- never reads the new columns or the new table):
--
--   psql -v ON_ERROR_STOP=1 "$POSTGRES_URL" -f packages/db/migrations/2026-10-05-group-accounts.sql
--
-- on the dokku box, where the database has no exposed port, pipe it through
-- the postgres plugin instead:
--
--   ssh falkenstein 'dokku postgres:connect laundryroom-db' < packages/db/migrations/2026-10-05-group-accounts.sql
--
-- (ON_ERROR_STOP matters: without it psql carries on after a failed
-- statement, the COMMIT at the end silently becomes a ROLLBACK and psql still
-- exits 0, so an aborted run looks like a successful one. postgres:connect
-- takes no psql flags, hence the \set below as well; it is a psql command,
-- so run this file with psql, not with another client)
--
-- what it does
--   group             gains did (unique) and handle, both nullable: the
--                     group's atproto account on pds.lndry.social, written by
--                     the worker only. existing groups keep null until the
--                     one-off backfill (README, "Group accounts") creates
--                     their accounts. also readable_slug (unique: the
--                     readable handle a group holds, kept while it is not
--                     public, so nobody else takes it), active_since (when
--                     it last became active; a group is published only after
--                     a day of that, null = before group accounts, which
--                     counts as long ago) and published_at (when its public
--                     profile record was last written, null while there is
--                     none)
--   group_credential  the custodied credentials of each group account: the
--                     "laundryroom-writer" app password and the master
--                     password, aes-256-gcm encrypted by the worker
--                     (GROUP_CREDENTIAL_KEY_1/_2; key_id is the fingerprint
--                     of the key that encrypted the row). deleted with its
--                     group. nothing outside the worker reads it
--
-- no data changes. idempotent: every statement checks first (IF NOT EXISTS,
-- and the foreign key is only added when missing), so a re-run is a no-op.
-- one transaction, so a failure leaves nothing half-done.
--
-- the definitions mirror packages/db/src/schema.ts exactly (types, defaults,
-- index and constraint names), so `pnpm --filter @laundryroom/db push`
-- reports no changes afterwards.

\set ON_ERROR_STOP on

BEGIN;

ALTER TABLE "group" ADD COLUMN IF NOT EXISTS "did" text;
ALTER TABLE "group" ADD COLUMN IF NOT EXISTS "handle" text;
ALTER TABLE "group" ADD COLUMN IF NOT EXISTS "readable_slug" text;
ALTER TABLE "group" ADD COLUMN IF NOT EXISTS "active_since" timestamp with time zone;
ALTER TABLE "group" ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone;

-- one account per group, one group per account, one group per readable
-- slug. nulls do not collide (every existing group has none)
CREATE UNIQUE INDEX IF NOT EXISTS "group_did_idx" ON "group" USING btree ("did");
CREATE UNIQUE INDEX IF NOT EXISTS "group_readable_slug_idx" ON "group" USING btree ("readable_slug");

CREATE TABLE IF NOT EXISTS "group_credential" (
  "group_id" uuid NOT NULL,
  "did" text,
  "app_password_enc" text,
  "master_password_enc" text NOT NULL,
  "key_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "rotated_at" timestamp with time zone,
  CONSTRAINT "group_credential_pkey" PRIMARY KEY ("group_id")
);

-- the foreign key on its own, so that a re-run (the table already exists)
-- still adds it if an earlier attempt somehow lacks it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'group_credential_group_id_group_id_fk'
  ) THEN
    ALTER TABLE "group_credential"
      ADD CONSTRAINT "group_credential_group_id_group_id_fk"
      FOREIGN KEY ("group_id") REFERENCES "public"."group"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "group_credential_did_idx" ON "group_credential" USING btree ("did");

COMMIT;
