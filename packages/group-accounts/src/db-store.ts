import type { DidString } from "@atproto/lex";

import type { SQL } from "@laundryroom/db";
import { preferredGroupSlug } from "@laundryroom/atproto";
import { and, asc, eq, isNull, ne, sql } from "@laundryroom/db";
import { db } from "@laundryroom/db/client";
import { Group, GroupCredential } from "@laundryroom/db/schema";

import type { CredentialCipher } from "./cipher";
import type { GroupCredentialStore, StoredGroupCredential } from "./store";
import { GroupAccountError } from "./errors";

type Db = typeof db;
type SecretColumn = "app_password" | "master_password";

/**
 * The additional data of a secret: its group and column. Anything that
 * writes group_credential must encrypt with exactly this (and the cipher's
 * current key), or the worker cannot read the row: use this store.
 */
export const credentialContext = (groupId: string, column: SecretColumn) =>
  `group_credential:${groupId}:${column}`;

/** A unique index refused the write (postgres 23505), through drizzle. */
function isUniqueViolation(err: unknown): boolean {
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value
      ? value.code
      : undefined;
  return (
    code(err) === "23505" ||
    (err instanceof Error && code(err.cause) === "23505")
  );
}

const gone = (groupId: string, what: string) =>
  new GroupAccountError(`the ${what} of group ${groupId} is gone`, {
    permanent: true,
  });

/**
 * group_credential (encrypted secrets, did) plus group.did, group.handle
 * and group.readable_slug, the copies the app reads. Worker only: nothing
 * here may run in a request, and no value read here may reach a client or a
 * log.
 */
export class DbGroupCredentialStore implements GroupCredentialStore {
  constructor(
    private readonly cipher: CredentialCipher,
    private readonly database: Db = db,
  ) {}

  get(groupId: string) {
    return this.load(eq(GroupCredential.groupId, groupId));
  }

  getByDid(did: string) {
    return this.load(eq(GroupCredential.did, did));
  }

  async reserve(
    groupId: string,
    { handle, masterPassword }: { handle: string; masterPassword: string },
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      // a reservation from an earlier attempt keeps its master password
      await tx
        .insert(GroupCredential)
        .values({
          groupId,
          masterPasswordEnc: this.cipher.encrypt(
            masterPassword,
            credentialContext(groupId, "master_password"),
          ),
          keyId: this.cipher.currentKeyId,
        })
        .onConflictDoNothing({ target: GroupCredential.groupId });
      // only while no account exists: a finished account's handle is
      // changed through saveHandle
      await tx
        .update(Group)
        .set({ handle })
        .where(and(eq(Group.id, groupId), isNull(Group.did)));
    });
  }

  async saveDid(groupId: string, did: DidString): Promise<boolean> {
    const vanished = new Error("vanished");
    try {
      await this.database.transaction(async (tx) => {
        const credential = await tx
          .update(GroupCredential)
          .set({ did })
          .where(eq(GroupCredential.groupId, groupId))
          .returning({ groupId: GroupCredential.groupId });
        const group = await tx
          .update(Group)
          .set({ did })
          .where(eq(Group.id, groupId))
          .returning({ id: Group.id });
        // rolls both back
        if (credential.length !== 1 || group.length !== 1) throw vanished;
      });
      return true;
    } catch (err) {
      if (err === vanished) return false;
      throw err;
    }
  }

  async saveAppPassword(groupId: string, appPassword: string): Promise<void> {
    const current = await this.get(groupId);
    if (!current) throw gone(groupId, "credential row");
    await this.write(groupId, {
      masterPassword: current.masterPassword,
      appPassword,
      rotated: current.appPassword !== null,
    });
  }

  async saveHandle(groupId: string, handle: string): Promise<void> {
    const updated = await this.database
      .update(Group)
      .set({ handle })
      .where(eq(Group.id, groupId))
      .returning({ id: Group.id });
    if (updated.length !== 1) throw gone(groupId, "row");
  }

  async claimedSlug(groupId: string): Promise<string | null> {
    await this.claimForOlderGroups(groupId);
    const [row] = await this.database
      .select({ slug: Group.readableSlug })
      .from(Group)
      .where(eq(Group.id, groupId));
    return row?.slug ?? null;
  }

  async claimSlug(groupId: string, slug: string): Promise<boolean> {
    const [holder] = await this.database
      .select({ id: Group.id })
      .from(Group)
      .where(eq(Group.readableSlug, slug));
    if (holder) return holder.id === groupId;
    return this.tryClaim(groupId, slug, { onlyFirst: false });
  }

  async replaceCredential(
    groupId: string,
    credential: { did: DidString; masterPassword: string; appPassword: string },
  ): Promise<void> {
    const values = {
      did: credential.did,
      masterPasswordEnc: this.cipher.encrypt(
        credential.masterPassword,
        credentialContext(groupId, "master_password"),
      ),
      appPasswordEnc: this.cipher.encrypt(
        credential.appPassword,
        credentialContext(groupId, "app_password"),
      ),
      keyId: this.cipher.currentKeyId,
      rotatedAt: new Date(),
    };
    await this.database
      .insert(GroupCredential)
      .values({ groupId, ...values })
      .onConflictDoUpdate({ target: GroupCredential.groupId, set: values });
  }

  /**
   * Gives every public group created before `groupId` that holds no slug
   * the slug it would ask for first, oldest first, where it is free. Cheap
   * once done: afterwards only groups without a usable name are left over.
   * Only public groups (active, moderation ok): they have, or are about to
   * get, a readable handle; the others claim theirs once they go public.
   */
  private async claimForOlderGroups(groupId: string): Promise<void> {
    const older = await this.database
      .select({ id: Group.id, name: Group.name })
      .from(Group)
      .where(
        and(
          isNull(Group.readableSlug),
          ne(Group.id, groupId),
          sql`coalesce(${Group.status}, 'active') = 'active'`,
          sql`coalesce(${Group.moderationStatus}, 'ok') = 'ok'`,
          sql`(${Group.createdAt}, ${Group.id}) < (select g.created_at, g.id from "group" g where g.id = ${groupId})`,
        ),
      )
      .orderBy(asc(Group.createdAt), asc(Group.id));
    for (const group of older) {
      const slug = preferredGroupSlug(group.name);
      if (slug) await this.tryClaim(group.id, slug, { onlyFirst: true });
    }
  }

  /**
   * Sets the group's claim to `slug` if no other group holds it (and, with
   * onlyFirst, only if the group holds none yet). Whether it now holds it.
   */
  private async tryClaim(
    groupId: string,
    slug: string,
    { onlyFirst }: { onlyFirst: boolean },
  ): Promise<boolean> {
    try {
      const updated = await this.database
        .update(Group)
        .set({ readableSlug: slug })
        .where(
          and(
            eq(Group.id, groupId),
            onlyFirst ? isNull(Group.readableSlug) : undefined,
            sql`not exists (select 1 from "group" g where g.readable_slug = ${slug} and g.id <> ${groupId})`,
          ),
        )
        .returning({ id: Group.id });
      return updated.length === 1;
    } catch (err) {
      // another group claimed it at the same moment
      if (isUniqueViolation(err)) return false;
      throw err;
    }
  }

  private async load(where: SQL): Promise<StoredGroupCredential | null> {
    const [row] = await this.database
      .select({
        groupId: GroupCredential.groupId,
        did: GroupCredential.did,
        appPasswordEnc: GroupCredential.appPasswordEnc,
        masterPasswordEnc: GroupCredential.masterPasswordEnc,
        keyId: GroupCredential.keyId,
        handle: Group.handle,
      })
      .from(GroupCredential)
      .innerJoin(Group, eq(Group.id, GroupCredential.groupId))
      .where(where)
      .limit(1);
    if (!row) return null;

    const masterPassword = this.cipher.decrypt(
      row.masterPasswordEnc,
      row.keyId,
      credentialContext(row.groupId, "master_password"),
    );
    const appPassword =
      row.appPasswordEnc === null
        ? null
        : this.cipher.decrypt(
            row.appPasswordEnc,
            row.keyId,
            credentialContext(row.groupId, "app_password"),
          );
    // key rotation: rows still on the old key move to the current one
    if (row.keyId !== this.cipher.currentKeyId) {
      await this.write(row.groupId, {
        masterPassword,
        appPassword,
        rotated: true,
      });
    }
    return {
      groupId: row.groupId,
      did: row.did as DidString | null,
      handle: row.handle,
      appPassword,
      masterPassword,
    };
  }

  /** Writes both secrets under the current key. */
  private async write(
    groupId: string,
    secrets: {
      masterPassword: string;
      appPassword: string | null;
      rotated: boolean;
    },
  ): Promise<void> {
    const updated = await this.database
      .update(GroupCredential)
      .set({
        masterPasswordEnc: this.cipher.encrypt(
          secrets.masterPassword,
          credentialContext(groupId, "master_password"),
        ),
        appPasswordEnc:
          secrets.appPassword === null
            ? null
            : this.cipher.encrypt(
                secrets.appPassword,
                credentialContext(groupId, "app_password"),
              ),
        keyId: this.cipher.currentKeyId,
        ...(secrets.rotated ? { rotatedAt: new Date() } : {}),
      })
      .where(eq(GroupCredential.groupId, groupId))
      .returning({ groupId: GroupCredential.groupId });
    if (updated.length !== 1) throw gone(groupId, "credential row");
  }
}
