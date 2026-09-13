-- next-auth -> better-auth, 2026-09-13
--
-- run this ONCE against the live database BEFORE deploying the better-auth
-- code (the old code keeps working until the deploy, but it can no longer
-- sign anyone in once this has run):
--
--   psql -v ON_ERROR_STOP=1 "$POSTGRES_URL" -f packages/db/migrations/2026-09-13-better-auth.sql
--
-- (-v ON_ERROR_STOP=1 matters: without it psql carries on after a failed
-- statement, the COMMIT at the end silently becomes a ROLLBACK and psql still
-- exits 0, so an aborted run looks like a successful one)
--
-- what it does
--   user   adds updated_at, turns "emailVerified" (timestamp) into
--          email_verified (boolean), makes name not null (default ''),
--          lower-cases every email (better-auth only matches lower-case) and
--          adds the unique index on email
--   auth   drops the next-auth session / account / "verificationToken" tables
--          and creates better-auth's session / account / verification tables.
--          sessions, oauth links and pending tokens are disposable: everyone
--          signs in again and google users re-link on their first sign-in
--          (account linking with google as a trusted provider)
--
-- idempotent: every step checks the current state first, so re-running it is
-- harmless and never drops the new tables once they exist. it is a single
-- transaction, so a failure (e.g. duplicate emails, see below) rolls
-- everything back.
--
-- the table definitions below mirror packages/db/src/schema.ts exactly
-- (column names, types, defaults, constraint and index names), so that
-- `pnpm --filter @laundryroom/db push` reports no changes afterwards.
-- (drizzle-kit 0.31.0 misreads postgres 18's not-null constraints and plans
-- dozens of bogus DROP CONSTRAINTs against the live db; use 0.31.10 or newer
-- for that check)

BEGIN;

-- ---------------------------------------------------------------------------
-- user
-- ---------------------------------------------------------------------------

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

-- "emailVerified" timestamp (next-auth) -> email_verified boolean (better-auth)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'emailVerified'
  ) THEN
    ALTER TABLE "user" RENAME COLUMN "emailVerified" TO "email_verified";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'email_verified'
  ) THEN
    ALTER TABLE "user" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;
  ELSIF (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'email_verified'
  ) <> 'boolean' THEN
    ALTER TABLE "user" ALTER COLUMN "email_verified" DROP DEFAULT;
    ALTER TABLE "user" ALTER COLUMN "email_verified" TYPE boolean
      USING ("email_verified" IS NOT NULL);
  END IF;
END $$;

UPDATE "user" SET "email_verified" = false WHERE "email_verified" IS NULL;
ALTER TABLE "user" ALTER COLUMN "email_verified" SET DEFAULT false;
ALTER TABLE "user" ALTER COLUMN "email_verified" SET NOT NULL;

-- next-auth's google provider never set "emailVerified", so google users end
-- up with email_verified = false above. better-auth refuses to link a google
-- account to a local user whose email is not verified (account linking's
-- requireLocalEmailVerified, on by default), which would lock exactly those
-- users out with error=account_not_linked. google did verify their mailbox,
-- so mark them while the old account table (providerAccountId) still exists.
-- (inside a DO block: postgres would otherwise reject the "userId" reference
-- at parse time on a re-run, once the new account table is in place)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'account' AND column_name = 'providerAccountId'
  ) THEN
    UPDATE "user" u SET "email_verified" = true
      FROM "account" a
      WHERE a."userId" = u."id" AND a."provider" = 'google';
  END IF;
END $$;

-- better-auth requires name to be a string, not null. deliberately '' and not
-- the local part of the email: names are public (profile page, member lists,
-- comments) and the email local part is often a real name or a handle the
-- person never chose to show. '' is also what better-auth stores for new
-- magic-link sign-ups, and the app asks for a name on the first sign-in while
-- it is empty (apps/nextjs/src/app/_components/ask-for-name.tsx).
UPDATE "user" SET "name" = '' WHERE "name" IS NULL;
ALTER TABLE "user" ALTER COLUMN "name" SET DEFAULT '';
ALTER TABLE "user" ALTER COLUMN "name" SET NOT NULL;

-- better-auth lower-cases every email it stores and looks up (magic link,
-- google sign-in, account linking), while next-auth stored google profile
-- emails as received. a user with an upper-case letter in their email would
-- otherwise be invisible after the switch and get a second, empty account on
-- their next sign-in. normalise first, then make the column unique.
UPDATE "user" SET "email" = lower("email") WHERE "email" <> lower("email");

-- better-auth looks users up by email, which therefore has to be unique.
-- if this statement fails (also when two rows only differed in case and
-- collapsed onto the same address above), find the duplicates with
--   SELECT lower(email), count(*) FROM "user" GROUP BY 1 HAVING count(*) > 1;
-- merge or delete them, and run the file again.
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_idx" ON "user" USING btree ("email");

-- ---------------------------------------------------------------------------
-- next-auth tables -> better-auth tables
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS "verificationToken" CASCADE;

-- the next-auth session / account tables share their names with the new ones,
-- so drop them only while they still have the next-auth shape
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'session' AND column_name = 'sessionToken'
  ) THEN
    DROP TABLE "session" CASCADE;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'account' AND column_name = 'providerAccountId'
  ) THEN
    DROP TABLE "account" CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "session" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "token" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id" uuid NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "session_token_unique" UNIQUE ("token"),
  CONSTRAINT "session_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "session_user_id_idx" ON "session" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "user_id" uuid NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp with time zone,
  "refresh_token_expires_at" timestamp with time zone,
  "scope" text,
  "password" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "user" ("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "account_user_id_idx" ON "account" USING btree ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" USING btree ("identifier");

COMMIT;
