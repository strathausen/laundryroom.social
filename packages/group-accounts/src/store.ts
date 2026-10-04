import type { DidString } from "@atproto/lex";

/**
 * What LocalPdsGroupHost keeps per group, decrypted. Lives in
 * group_credential (secrets, did) and group (did, handle); see
 * DbGroupCredentialStore. A row without a did is an account being created:
 * its master password and reserved handle are stored before
 * createAccount runs, so a retry after a crash finds and finishes that
 * account instead of creating a second one.
 */
export interface StoredGroupCredential {
  groupId: string;
  /** null while the account is being created */
  did: DidString | null;
  /** the account's handle, or the one it is being created with */
  handle: string | null;
  /** the "laundryroom-writer" app password; null until created */
  appPassword: string | null;
  /** the account password */
  masterPassword: string;
}

/** Persistence for LocalPdsGroupHost; secrets go in and out in plain text. */
export interface GroupCredentialStore {
  get(groupId: string): Promise<StoredGroupCredential | null>;
  getByDid(did: string): Promise<StoredGroupCredential | null>;
  /**
   * Keeps the master password and the handle about to be tried, before
   * createAccount. Called again for each new handle candidate.
   */
  reserve(
    groupId: string,
    reservation: { handle: string; masterPassword: string },
  ): Promise<void>;
  /**
   * The account exists: its did (and the reserved handle) are final. false
   * when the group's row (or its credential row) is gone meanwhile: then
   * nothing was saved, and the caller takes the new account down again.
   */
  saveDid(groupId: string, did: DidString): Promise<boolean>;
  saveAppPassword(groupId: string, appPassword: string): Promise<void>;
  saveHandle(groupId: string, handle: string): Promise<void>;
  /**
   * The readable slug the group holds, or null. First gives every older
   * public group that holds none the slug it would ask for, so a newer group
   * never takes the name of an older one that has not got its handle yet
   * (the backfill takes days). Call it before claimSlug.
   */
  claimedSlug(groupId: string): Promise<string | null>;
  /**
   * Claims a readable slug for the group, before the pds is asked for it:
   * true when the group holds it now, false when another group does. A
   * group holds one slug; claiming another moves its claim. Claims are never
   * released otherwise, also not while the group's handle is opaque.
   */
  claimSlug(groupId: string, slug: string): Promise<boolean>;
  /**
   * Stores fresh credentials for an existing account (custody recovery),
   * whether or not a credential row is left.
   */
  replaceCredential(
    groupId: string,
    credential: { did: DidString; masterPassword: string; appPassword: string },
  ): Promise<void>;
}

/** An in-memory store, for tests and the dev-env contract test. */
export class MemoryGroupCredentialStore implements GroupCredentialStore {
  readonly rows = new Map<string, StoredGroupCredential>();
  /** slug → group id */
  readonly claims = new Map<string, string>();

  get(groupId: string) {
    const row = this.rows.get(groupId);
    return Promise.resolve(row ? { ...row } : null);
  }

  getByDid(did: string) {
    const row = [...this.rows.values()].find((r) => r.did === did);
    return Promise.resolve(row ? { ...row } : null);
  }

  reserve(
    groupId: string,
    { handle, masterPassword }: { handle: string; masterPassword: string },
  ) {
    const row = this.rows.get(groupId);
    this.rows.set(groupId, {
      groupId,
      did: row?.did ?? null,
      appPassword: row?.appPassword ?? null,
      masterPassword: row?.masterPassword ?? masterPassword,
      handle,
    });
    return Promise.resolve();
  }

  saveDid(groupId: string, did: DidString) {
    if (!this.rows.has(groupId)) return Promise.resolve(false);
    return this.update(groupId, { did }).then(() => true);
  }

  saveAppPassword(groupId: string, appPassword: string) {
    return this.update(groupId, { appPassword });
  }

  saveHandle(groupId: string, handle: string) {
    return this.update(groupId, { handle });
  }

  claimedSlug(groupId: string) {
    for (const [slug, owner] of this.claims) {
      if (owner === groupId) return Promise.resolve(slug);
    }
    return Promise.resolve(null);
  }

  claimSlug(groupId: string, slug: string) {
    const owner = this.claims.get(slug);
    if (owner === groupId) return Promise.resolve(true);
    if (owner !== undefined) return Promise.resolve(false);
    for (const [held, holder] of this.claims) {
      if (holder === groupId) this.claims.delete(held);
    }
    this.claims.set(slug, groupId);
    return Promise.resolve(true);
  }

  replaceCredential(
    groupId: string,
    credential: { did: DidString; masterPassword: string; appPassword: string },
  ) {
    const row = this.rows.get(groupId);
    this.rows.set(groupId, {
      groupId,
      handle: row?.handle ?? null,
      ...credential,
    });
    return Promise.resolve();
  }

  private update(groupId: string, patch: Partial<StoredGroupCredential>) {
    const row = this.rows.get(groupId);
    if (!row) return Promise.reject(new Error(`no credential for ${groupId}`));
    this.rows.set(groupId, { ...row, ...patch });
    return Promise.resolve();
  }
}
