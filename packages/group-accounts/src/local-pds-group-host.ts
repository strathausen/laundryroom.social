import type { Agent, BlobRef, DidString, LexValue } from "@atproto/lex";
import {
  cidForRawBytes,
  getBlobCidString,
  isBlobRef,
  jsonToLex,
  lexEquals,
  lexStringify,
} from "@atproto/lex";
import { z } from "zod";

import type {
  GroupAccount,
  GroupAvatar,
  GroupHandleIntent,
  GroupHost,
  GroupProfileFields,
  RecordRef,
} from "@laundryroom/atproto";
import {
  buildRecord,
  groupHandle,
  handleFitsIntent,
  isDeniedGroupSlug,
  isOpaqueGroupSlug,
  isValidGroupSlug,
  NSID,
  opaqueGroupSlugCandidates,
  readableGroupSlugCandidates,
  RKEY,
  slugOfHandle,
  XRPC,
} from "@laundryroom/atproto";

import type { GroupCredentialStore, StoredGroupCredential } from "./store";
import { randomPassword } from "./cipher";
import { GroupAccountError } from "./errors";
import { serviceAgent, xrpc, XrpcError } from "./xrpc";

/** The name of the app password every write as the group uses. */
export const WRITER_APP_PASSWORD_NAME = "laundryroom-writer";

/** Refresh a little before the access token runs out. */
const EXPIRY_MARGIN_MS = 60_000;
/** If a token's expiry cannot be read, assume this much (legacy: 2 h). */
const FALLBACK_TOKEN_LIFETIME_MS = 10 * 60_000;
/** How long the plc lookup of a new account may take. */
const PLC_TIMEOUT_MS = 30_000;
const MAX_DID_DOCUMENT_BYTES = 64 * 1024;

/** Every account on our pds is a did:plc. */
const PLC_DID = /^did:plc:[a-z2-7]{24}$/;

export interface LocalPdsGroupHostOptions {
  /** e.g. https://pds.lndry.social */
  pdsUrl: string;
  /** e.g. lndry.social */
  handleDomain: string;
  /** e.g. lndry.social: emails are groups+<slug>@<emailDomain> */
  emailDomain: string;
  /**
   * basic auth for the admin calls: single-use invite codes, and custody
   * recovery and takedowns
   */
  adminPassword: string;
  /** sent as x-ratelimit-bypass, only when set */
  rateLimitBypassKey?: string;
  /**
   * where a new account's did document is checked (its pds and handle);
   * unset skips the check (tests)
   */
  plcUrl?: string;
  store: GroupCredentialStore;
  /** for every request to the pds */
  fetch?: typeof fetch;
  /** for the plc lookup */
  plcFetch?: typeof fetch;
}

type SessionKind = "app" | "full";

interface Session {
  did: DidString;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
  /** ms since the epoch */
  accessExpiresAt: number;
}

const sessionOutput = z.object({
  did: z.string().regex(PLC_DID),
  handle: z.string(),
  accessJwt: z.string().min(1),
  refreshJwt: z.string().min(1),
});
const inviteOutput = z.object({ code: z.string().min(1) });
const appPasswordOutput = z.object({
  name: z.string(),
  password: z.string().min(1),
});
const appPasswordListOutput = z.object({
  passwords: z.array(z.object({ name: z.string() })),
});
const getSessionOutput = z.object({
  did: z.string(),
  handle: z.string(),
});
const getRecordOutput = z.object({
  uri: z.string(),
  cid: z.string().optional(),
  value: z.record(z.unknown()),
});
const writeOutput = z.object({ uri: z.string(), cid: z.string() });
const uploadBlobOutput = z.object({ blob: z.record(z.unknown()) });
const didDocument = z.object({
  id: z.string(),
  alsoKnownAs: z.array(z.string()).default([]),
  service: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        serviceEndpoint: z.unknown(),
      }),
    )
    .default([]),
});

/** What the pds says about a handle it was asked for. */
type HandleRefusal =
  /** someone has it (deactivated accounts included), or its email: try the next */
  | "taken"
  /** reserved, or refused by the pds's slur filter: no variant of it either */
  | "unavailable";

/**
 * Group accounts on our own pds (pds.lndry.social), with the credentials
 * held by laundryroom: the group-host-lite of docs/atproto-plan.md, "group
 * accounts on lndry.social". Talks plain xrpc to the pds; every record is
 * validated with buildRecord before it is written.
 *
 * Sessions are legacy bearer sessions (createSession), cached in this
 * process and refreshed before they run out: createSession is limited to 30
 * per 5 minutes and 300 per day per account and ip, unless the pds's
 * rate-limit bypass key is configured. The app password ("laundryroom-
 * writer") makes every write; the master password only manages app
 * passwords and deactivates.
 *
 * Readable handles are claimed in the store before the pds is asked for
 * them, and a claim outlives the handle (see GroupCredentialStore): a
 * group that goes private and back gets its own handle again, and no other
 * group can take it meanwhile.
 */
export class LocalPdsGroupHost implements GroupHost {
  private readonly fetchImpl: typeof fetch;
  private readonly plcFetch: typeof fetch;

  /**
   * @param sessions shared with the views withSignal returns, so a job's
   * view reuses the process's sessions
   */
  constructor(
    private readonly options: LocalPdsGroupHostOptions,
    private readonly sessions = new Map<string, Session>(),
    private readonly signal?: AbortSignal,
  ) {
    this.fetchImpl = withAbort(options.fetch ?? fetch, signal);
    this.plcFetch = withAbort(options.plcFetch ?? fetch, signal);
  }

  /**
   * This host for one job: every request is aborted, and every store call
   * refused, once `signal` aborts (the job was stopped, ran too long, or
   * lost its group lock). Shares this host's sessions.
   */
  withSignal(signal: AbortSignal): LocalPdsGroupHost {
    return new LocalPdsGroupHost(
      { ...this.options, store: guardedStore(this.options.store, signal) },
      this.sessions,
      signal,
    );
  }

  // -------------------------------------------------------------------------
  // GroupHost

  async findGroupAccount(groupId: string): Promise<GroupAccount | null> {
    const stored = await this.options.store.get(groupId);
    if (!stored) return null;
    if (stored.did) {
      if (!stored.appPassword) await this.ensureAppPassword(stored);
      return {
        did: stored.did,
        handle: stored.handle ?? (await this.currentHandle(stored.did)),
      };
    }
    if (!stored.handle) return null;
    // an earlier attempt reserved this handle and password and then stopped:
    // either before createAccount (the login fails, nothing to finish) or
    // after it (the account exists, finish it)
    const session = await this.tryLogin(stored.handle, stored.masterPassword);
    if (!session) return null;
    return this.finishCreation(groupId, session, stored.masterPassword);
  }

  async createGroupAccount({
    groupId,
    handle: intent,
  }: {
    groupId: string;
    handle: GroupHandleIntent;
  }): Promise<GroupAccount> {
    const existing = await this.findGroupAccount(groupId);
    if (existing) return existing;

    const stored = await this.options.store.get(groupId);
    const masterPassword = stored?.masterPassword ?? randomPassword();
    // one single-use invite for all candidates: createAccount checks the
    // handle and email before it uses up the code
    let inviteCode: string | undefined;
    let tries = 0;
    const attempt = async (slug: string): Promise<Session | HandleRefusal> => {
      tries++;
      const handle = groupHandle(slug, this.options.handleDomain);
      await this.options.store.reserve(groupId, { handle, masterPassword });
      inviteCode ??= await this.createInviteCode();
      try {
        return toSession(
          await xrpc(this.publicAgent(), {
            method: XRPC.serverCreateAccount,
            type: "procedure",
            body: {
              json: {
                handle,
                email: `groups+${slug}@${this.options.emailDomain}`,
                password: masterPassword,
                inviteCode,
              },
            },
            output: sessionOutput,
          }),
        );
      } catch (err) {
        const refusal = handleRefusal(err);
        if (refusal) return refusal;
        throw err;
      }
    };

    if (intent.kind === "readable") {
      for (const slug of await this.readableCandidates(groupId, intent.name)) {
        if (!(await this.options.store.claimSlug(groupId, slug))) continue;
        const result = await attempt(slug);
        if (result === "taken") continue;
        if (result === "unavailable") break;
        return this.finishCreation(groupId, result, masterPassword);
      }
      // nothing readable to be had (a non-latin or reserved name, or every
      // variant taken): an opaque handle, which says nothing wrong about a
      // public group either
    }
    for (const slug of opaqueGroupSlugCandidates()) {
      const result = await attempt(slug);
      if (typeof result === "string") continue;
      return this.finishCreation(groupId, result, masterPassword);
    }
    throw new GroupAccountError(
      `the pds refused all ${tries} handles tried for group ${groupId}`,
      { permanent: true },
    );
  }

  async writer(groupDid: DidString): Promise<Agent> {
    // log in now, so a broken credential fails here and not mid-write
    await this.session(groupDid, "app");
    return this.sessionAgent(groupDid, "app");
  }

  async syncSession(groupDid: DidString): Promise<Agent> {
    await this.session(groupDid, "full");
    return this.sessionAgent(groupDid, "full");
  }

  async updateHandle({
    groupDid,
    handle: intent,
  }: {
    groupDid: DidString;
    handle: GroupHandleIntent;
  }): Promise<string> {
    const stored = await this.requireStored(groupDid);
    const { store, handleDomain } = this.options;
    const writer = await this.writer(groupDid);
    const current = await this.currentHandle(groupDid, writer);
    const settle = async (handle: string) => {
      if (stored.handle !== handle)
        await store.saveHandle(stored.groupId, handle);
      return handle;
    };

    if (handleFitsIntent(current, handleDomain, intent)) {
      const slug = slugOfHandle(current, handleDomain);
      if (
        intent.kind === "readable" &&
        slug &&
        !(await store.claimSlug(stored.groupId, slug))
      ) {
        console.warn(
          `[group-accounts] ${groupDid} has the handle ${current}, but another group claims it`,
        );
      }
      return settle(current);
    }

    const attempt = async (slug: string): Promise<"ok" | HandleRefusal> => {
      try {
        await xrpc(writer, {
          method: XRPC.identityUpdateHandle,
          type: "procedure",
          body: { json: { handle: groupHandle(slug, handleDomain) } },
        });
        return "ok";
      } catch (err) {
        const refusal = handleRefusal(err);
        if (refusal) return refusal;
        throw err;
      }
    };

    let tries = 0;
    if (intent.kind === "readable") {
      for (const slug of await this.readableCandidates(
        stored.groupId,
        intent.name,
      )) {
        if (!(await store.claimSlug(stored.groupId, slug))) continue;
        tries++;
        const result = await attempt(slug);
        if (result === "taken") continue;
        if (result === "unavailable") break;
        return settle(groupHandle(slug, handleDomain));
      }
      // no readable handle to be had: keep the opaque one it has rather
      // than minting a new one on every sync (each is a plc operation and
      // an identity event, and stays in the plc log forever)
      if (handleFitsIntent(current, handleDomain, { kind: "opaque" })) {
        return settle(current);
      }
    }
    for (const slug of opaqueGroupSlugCandidates()) {
      tries++;
      if ((await attempt(slug)) !== "ok") continue;
      return settle(groupHandle(slug, handleDomain));
    }
    throw new GroupAccountError(
      `the pds refused all ${tries} handles tried for ${groupDid}`,
      { permanent: true },
    );
  }

  async updateProfile({
    groupDid,
    profile,
    avatar,
  }: {
    groupDid: DidString;
    profile: GroupProfileFields;
    avatar?: GroupAvatar | null;
  }): Promise<{ ref: RecordRef; changed: boolean }> {
    const writer = await this.writer(groupDid);
    const existing = await this.getProfileRecord(groupDid, writer);
    const stored = existing?.value;

    let blob: BlobRef | undefined;
    let alt: string | undefined;
    if (avatar === undefined) {
      // keep whatever the stored record has
      blob = isBlobRef(stored?.avatar) ? stored.avatar : undefined;
      alt =
        blob && typeof stored?.avatarAlt === "string"
          ? stored.avatarAlt
          : undefined;
    } else if (avatar) {
      const cid = (await cidForRawBytes(avatar.bytes)).toString();
      blob =
        isBlobRef(stored?.avatar) && getBlobCidString(stored.avatar) === cid
          ? stored.avatar
          : await this.uploadBlob(writer, avatar);
      alt = avatar.alt;
    }

    const record = buildRecord(
      NSID.laundryroomGroupProfile,
      {
        ...profile,
        ...(blob ? { avatar: blob } : {}),
        ...(blob && alt ? { avatarAlt: alt } : {}),
      },
      { rkey: RKEY.self },
    );
    const ref = (uri: string, cid: string): RecordRef => ({
      uri: uri as RecordRef["uri"],
      cid,
      repo: groupDid,
      collection: NSID.laundryroomGroupProfile,
      rkey: RKEY.self,
      source: "repo",
    });
    if (existing?.cid && stored && sameRecord(stored, record)) {
      return { ref: ref(existing.uri, existing.cid), changed: false };
    }
    const written = await xrpc(writer, {
      method: XRPC.repoPutRecord,
      type: "procedure",
      body: {
        jsonText: lexStringify({
          repo: groupDid,
          collection: NSID.laundryroomGroupProfile,
          rkey: RKEY.self,
          // validated above with buildRecord; the reference pds does not
          // know our lexicons and would only store validationStatus unknown
          validate: false,
          record: record as unknown as LexValue,
        }),
      },
      output: writeOutput,
    });
    return { ref: ref(written.uri, written.cid), changed: true };
  }

  async deleteProfile(groupDid: DidString): Promise<boolean> {
    const writer = await this.writer(groupDid);
    const existing = await this.getProfileRecord(groupDid, writer);
    if (!existing) return false;
    await xrpc(writer, {
      method: XRPC.repoDeleteRecord,
      type: "procedure",
      body: {
        json: {
          repo: groupDid,
          collection: NSID.laundryroomGroupProfile,
          rkey: RKEY.self,
        },
      },
    });
    return true;
  }

  async deactivate(groupDid: DidString): Promise<void> {
    const full = await this.syncSession(groupDid);
    try {
      await xrpc(full, {
        method: XRPC.serverDeactivateAccount,
        type: "procedure",
        body: { json: {} },
      });
    } catch (err) {
      // a retry after the deactivation went through
      if (!(err instanceof XrpcError && err.error === "AccountDeactivated")) {
        throw err;
      }
    }
    this.forgetSessions(groupDid);
  }

  // -------------------------------------------------------------------------
  // admin: only where the group's own credential cannot help

  /**
   * Takes the account down with the pds admin password: the pds stops
   * serving its repo and tells the relay, so the profile and the handle
   * leave the network without the group's credential. Reversible by the
   * pds admin (takedown.applied false). For a deleted group whose account
   * cannot be reached any more.
   */
  async takeDown(groupDid: DidString, ref: string): Promise<void> {
    await xrpc(this.adminAgent(), {
      method: XRPC.adminUpdateSubjectStatus,
      type: "procedure",
      body: {
        json: {
          subject: { $type: "com.atproto.admin.defs#repoRef", did: groupDid },
          takedown: { applied: true, ref },
        },
      },
    });
    this.forgetSessions(groupDid);
  }

  /**
   * Custody recovery (docs/atproto-plan.md, the custody table): sets a new
   * random master password with the pds admin password, replaces the
   * "laundryroom-writer" app password and stores both, encrypted like every
   * other credential. For a group whose credential is lost, refused or no
   * longer decrypts. The admin password change ends every other session of
   * the account.
   */
  async recoverAccount(
    groupId: string,
    groupDid: DidString,
  ): Promise<GroupAccount> {
    const masterPassword = randomPassword();
    await xrpc(this.adminAgent(), {
      method: XRPC.adminUpdateAccountPassword,
      type: "procedure",
      body: { json: { did: groupDid, password: masterPassword } },
    });
    this.forgetSessions(groupDid);
    const session = await this.tryLogin(groupDid, masterPassword);
    if (session?.did !== groupDid) {
      throw new GroupAccountError(
        `the new master password of ${groupDid} is refused`,
        { permanent: true },
      );
    }
    this.sessions.set(sessionKey(groupDid, "full"), session);
    const appPassword = await this.replaceWriterAppPassword(groupDid);
    await this.options.store.replaceCredential(groupId, {
      did: groupDid,
      masterPassword,
      appPassword,
    });
    return { did: groupDid, handle: session.handle };
  }

  // -------------------------------------------------------------------------
  // sessions

  /** A valid session of `kind`, from the cache, a refresh or a login. */
  private async session(did: DidString, kind: SessionKind): Promise<Session> {
    const key = sessionKey(did, kind);
    const cached = this.sessions.get(key);
    if (cached && cached.accessExpiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return cached;
    }
    if (cached) {
      const refreshed = await this.refresh(cached).catch((err: unknown) => {
        if (err instanceof XrpcError && !err.retryable) return null;
        throw err;
      });
      if (refreshed) {
        this.sessions.set(key, refreshed);
        return refreshed;
      }
      this.sessions.delete(key);
    }
    const session = await this.login(did, kind);
    this.sessions.set(key, session);
    return session;
  }

  private async login(did: DidString, kind: SessionKind): Promise<Session> {
    const stored = await this.requireStored(did);
    if (kind === "full") {
      const session = await this.tryLogin(did, stored.masterPassword);
      if (!session) {
        throw new GroupAccountError(
          `the stored master password of ${did} is refused`,
          { permanent: true, credential: true },
        );
      }
      return session;
    }
    const appPassword =
      stored.appPassword ?? (await this.ensureAppPassword(stored));
    const session = await this.tryLogin(did, appPassword);
    if (session) return session;
    // the app password was revoked (or lost): make a new one with the
    // master password, once
    const renewed = await this.ensureAppPassword(stored);
    const retried = await this.tryLogin(did, renewed);
    if (!retried) {
      throw new GroupAccountError(`a fresh app password of ${did} is refused`, {
        permanent: true,
        credential: true,
      });
    }
    return retried;
  }

  /**
   * createSession; null when the pds says the identifier or password is
   * wrong (and only then: anything else, such as a network error, throws).
   */
  private async tryLogin(
    identifier: string,
    password: string,
  ): Promise<Session | null> {
    try {
      return toSession(
        await xrpc(this.publicAgent(), {
          method: XRPC.serverCreateSession,
          type: "procedure",
          body: { json: { identifier, password } },
          output: sessionOutput,
        }),
      );
    } catch (err) {
      if (
        err instanceof XrpcError &&
        err.status === 401 &&
        err.error === "AuthenticationRequired"
      ) {
        return null;
      }
      throw err;
    }
  }

  private async refresh(session: Session): Promise<Session> {
    const agent = serviceAgent(
      this.options.pdsUrl,
      () => ({
        ...this.bypassHeader(),
        authorization: `Bearer ${session.refreshJwt}`,
      }),
      this.fetchImpl,
    );
    return toSession(
      await xrpc(agent, {
        method: XRPC.serverRefreshSession,
        type: "procedure",
        output: sessionOutput,
      }),
    );
  }

  /**
   * An agent that always sends a current access token, and on an expired
   * one refreshes and sends the request once more.
   */
  private sessionAgent(did: DidString, kind: SessionKind): Agent {
    const send = async (
      path: `/${string}`,
      init: RequestInit,
      session: Session,
    ) => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${session.accessJwt}`);
      for (const [name, value] of Object.entries(this.bypassHeader())) {
        headers.set(name, value);
      }
      return this.fetchImpl(new URL(path, this.options.pdsUrl), {
        ...init,
        headers,
      });
    };
    return {
      did,
      fetchHandler: async (path, init) => {
        const session = await this.session(did, kind);
        const res = await send(path, init, session);
        if (res.status !== 400 || !(await isExpiredToken(res.clone()))) {
          return res;
        }
        // the cached expiry was wrong (clock skew, a revoked token): forget
        // it and try once more with a fresh session
        this.sessions.set(sessionKey(did, kind), {
          ...session,
          accessExpiresAt: 0,
        });
        return send(path, init, await this.session(did, kind));
      },
    };
  }

  private forgetSessions(did: DidString): void {
    this.sessions.delete(sessionKey(did, "app"));
    this.sessions.delete(sessionKey(did, "full"));
  }

  // -------------------------------------------------------------------------
  // helpers

  /**
   * Checks a new account before it is recorded: a did:plc whose document
   * names our pds and the handle we asked for. A pds that is not ours (a
   * wrong GROUP_PDS_URL) must not bind a group to someone else's did.
   * Then saves it; a group deleted meanwhile gets its account deactivated
   * again instead of leaving an orphan with a public handle behind.
   */
  private async finishCreation(
    groupId: string,
    session: Session,
    masterPassword: string,
  ): Promise<GroupAccount> {
    this.sessions.set(sessionKey(session.did, "full"), session);
    await this.verifyDidDocument(session.did, session.handle);
    if (!(await this.options.store.saveDid(groupId, session.did))) {
      await this.deactivate(session.did);
      throw new GroupAccountError(
        `group ${groupId} was deleted while its account ${session.did} was created; the account is deactivated again`,
        { permanent: true },
      );
    }
    await this.ensureAppPassword({
      groupId,
      did: session.did,
      handle: session.handle,
      appPassword: null,
      masterPassword,
    });
    return { did: session.did, handle: session.handle };
  }

  private async verifyDidDocument(did: DidString, handle: string) {
    const { plcUrl, pdsUrl } = this.options;
    if (!plcUrl) return;
    const fail = (why: string, permanent = true) =>
      new GroupAccountError(`the new account ${did} ${why}`, { permanent });
    let res: Response;
    try {
      res = await this.plcFetch(new URL(`/${did}`, plcUrl), {
        headers: { accept: "application/did+ld+json, application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(PLC_TIMEOUT_MS),
      });
    } catch (err) {
      throw new GroupAccountError(`the plc lookup of ${did} failed`, {
        permanent: false,
        cause: err,
      });
    }
    if (res.status === 404) {
      await res.body?.cancel();
      throw fail(
        `is not on ${plcUrl}; is GROUP_PLC_URL the plc the group pds uses?`,
      );
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw fail(`could not be looked up (plc answered ${res.status})`, false);
    }
    const text = await res.text();
    const parsed =
      text.length <= MAX_DID_DOCUMENT_BYTES
        ? didDocument.safeParse(safeJson(text))
        : null;
    if (!parsed?.success || parsed.data.id !== did) {
      throw fail("has no valid did document");
    }
    const pds = parsed.data.service.find(
      (service) =>
        service.id === "#atproto_pds" || service.id === `${did}#atproto_pds`,
    );
    if (
      typeof pds?.serviceEndpoint !== "string" ||
      !sameOrigin(pds.serviceEndpoint, pdsUrl)
    ) {
      throw fail(`is hosted somewhere else than ${pdsUrl}`);
    }
    if (!parsed.data.alsoKnownAs.includes(`at://${handle}`)) {
      throw fail(`does not have the handle ${handle}`);
    }
  }

  /**
   * The readable slugs to try for a group, in order: the one it holds
   * (claimed earlier: its own handle before it went private), then the
   * ones its name gives. Only usable ones (valid, not opaque, not denied).
   */
  private async readableCandidates(
    groupId: string,
    name: string,
  ): Promise<string[]> {
    const claimed = await this.options.store.claimedSlug(groupId);
    const candidates = [
      ...(claimed &&
      isValidGroupSlug(claimed) &&
      !isOpaqueGroupSlug(claimed) &&
      !isDeniedGroupSlug(claimed)
        ? [claimed]
        : []),
      ...readableGroupSlugCandidates(name),
    ];
    return [...new Set(candidates)];
  }

  /** Revokes any earlier writer app password and stores a new one. */
  private async ensureAppPassword(
    stored: StoredGroupCredential,
  ): Promise<string> {
    const did = stored.did;
    if (!did) throw new Error(`group ${stored.groupId} has no account yet`);
    const password = await this.replaceWriterAppPassword(did);
    await this.options.store.saveAppPassword(stored.groupId, password);
    return password;
  }

  /** With the full session: a new "laundryroom-writer", the old one gone. */
  private async replaceWriterAppPassword(did: DidString): Promise<string> {
    const full = await this.syncSession(did);
    const { passwords } = await xrpc(full, {
      method: XRPC.serverListAppPasswords,
      type: "query",
      output: appPasswordListOutput,
    });
    if (passwords.some((p) => p.name === WRITER_APP_PASSWORD_NAME)) {
      // its secret is gone (an interrupted run, or lost): replace it
      await xrpc(full, {
        method: XRPC.serverRevokeAppPassword,
        type: "procedure",
        body: { json: { name: WRITER_APP_PASSWORD_NAME } },
      });
    }
    const created = await xrpc(full, {
      method: XRPC.serverCreateAppPassword,
      type: "procedure",
      body: { json: { name: WRITER_APP_PASSWORD_NAME, privileged: false } },
      output: appPasswordOutput,
    });
    this.sessions.delete(sessionKey(did, "app"));
    return created.password;
  }

  private async createInviteCode(): Promise<string> {
    const { code } = await xrpc(this.adminAgent(), {
      method: XRPC.serverCreateInviteCode,
      type: "procedure",
      body: { json: { useCount: 1 } },
      output: inviteOutput,
    });
    return code;
  }

  /** The account's handle as the pds has it. */
  private async currentHandle(did: DidString, writer?: Agent): Promise<string> {
    const session = await xrpc(writer ?? (await this.writer(did)), {
      method: XRPC.serverGetSession,
      type: "query",
      output: getSessionOutput,
    });
    if (session.did !== did) {
      throw new GroupAccountError(`the session of ${did} is someone else's`, {
        permanent: true,
      });
    }
    return session.handle;
  }

  private async getProfileRecord(
    groupDid: DidString,
    agent: Agent,
  ): Promise<{
    uri: string;
    cid?: string;
    value: Record<string, LexValue>;
  } | null> {
    try {
      const found = await xrpc(agent, {
        method: XRPC.repoGetRecord,
        type: "query",
        params: {
          repo: groupDid,
          collection: NSID.laundryroomGroupProfile,
          rkey: RKEY.self,
        },
        output: getRecordOutput,
      });
      return {
        uri: found.uri,
        cid: found.cid,
        value: jsonToLex(found.value as never) as Record<string, LexValue>,
      };
    } catch (err) {
      if (err instanceof XrpcError && err.error === "RecordNotFound") {
        return null;
      }
      throw err;
    }
  }

  private async uploadBlob(
    agent: Agent,
    avatar: GroupAvatar,
  ): Promise<BlobRef> {
    const { blob } = await xrpc(agent, {
      method: XRPC.repoUploadBlob,
      type: "procedure",
      body: { bytes: avatar.bytes, mimeType: avatar.mimeType },
      output: uploadBlobOutput,
    });
    const ref = jsonToLex(blob as never);
    if (!isBlobRef(ref)) {
      throw new GroupAccountError("uploadBlob answered without a blob ref", {
        permanent: false,
      });
    }
    return ref;
  }

  private async requireStored(did: DidString): Promise<StoredGroupCredential> {
    const stored = await this.options.store.getByDid(did);
    if (!stored) {
      throw new GroupAccountError(`no stored credentials for ${did}`, {
        permanent: true,
        credential: true,
      });
    }
    return stored;
  }

  private publicAgent(): Agent {
    return serviceAgent(
      this.options.pdsUrl,
      () => this.bypassHeader(),
      this.fetchImpl,
    );
  }

  private adminAgent(): Agent {
    return serviceAgent(
      this.options.pdsUrl,
      () => ({
        ...this.bypassHeader(),
        authorization: `Basic ${Buffer.from(`admin:${this.options.adminPassword}`).toString("base64")}`,
      }),
      this.fetchImpl,
    );
  }

  private bypassHeader(): Record<string, string> {
    const key = this.options.rateLimitBypassKey;
    return key ? { "x-ratelimit-bypass": key } : {};
  }

  /** The slug of a handle on our domain (for tests and logs). */
  slugOf(handle: string): string | null {
    return slugOfHandle(handle, this.options.handleDomain);
  }
}

const sessionKey = (did: string, kind: SessionKind) => `${kind}:${did}`;

/** `fetchImpl`, aborted as well once `signal` aborts. */
function withAbort(
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): typeof fetch {
  if (!signal) return fetchImpl;
  return (input, init) =>
    fetchImpl(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal,
    });
}

/** The store, refusing every call once `signal` aborted. */
function guardedStore(
  store: GroupCredentialStore,
  signal: AbortSignal,
): GroupCredentialStore {
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      // rejects with the abort reason
      signal.throwIfAborted();
      return fn(...args);
    };
  return {
    get: guard((id: string) => store.get(id)),
    getByDid: guard((did: string) => store.getByDid(did)),
    reserve: guard(
      (id: string, r: { handle: string; masterPassword: string }) =>
        store.reserve(id, r),
    ),
    saveDid: guard((id: string, did: DidString) => store.saveDid(id, did)),
    saveAppPassword: guard((id: string, p: string) =>
      store.saveAppPassword(id, p),
    ),
    saveHandle: guard((id: string, h: string) => store.saveHandle(id, h)),
    claimedSlug: guard((id: string) => store.claimedSlug(id)),
    claimSlug: guard((id: string, slug: string) => store.claimSlug(id, slug)),
    replaceCredential: guard(
      (
        id: string,
        c: { did: DidString; masterPassword: string; appPassword: string },
      ) => store.replaceCredential(id, c),
    ),
  };
}

function toSession(output: z.infer<typeof sessionOutput>): Session {
  return {
    did: output.did as DidString,
    handle: output.handle,
    accessJwt: output.accessJwt,
    refreshJwt: output.refreshJwt,
    accessExpiresAt: jwtExpiry(output.accessJwt),
  };
}

/** The `exp` of a jwt in ms, or a short default when it cannot be read. */
function jwtExpiry(jwt: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { exp?: unknown };
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch {
    // fall through
  }
  return Date.now() + FALLBACK_TOKEN_LIFETIME_MS;
}

async function isExpiredToken(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return body.error === "ExpiredToken";
  } catch {
    return false;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/**
 * How the pds turned a handle down, or null when `err` is something else:
 * - "taken": by anyone (deactivated accounts included), or the email
 *   derived from it is: the next candidate (`-2`, a suffix) may work;
 * - "unavailable": reserved (HandleNotAvailable) or matched by the slur
 *   filter (InvalidHandle): no variant of it is offered either, the group
 *   gets an opaque handle instead of `admin-2`.
 * A handle domain the pds does not serve (UnsupportedDomain) is a config
 * error and not one of these.
 */
export function handleRefusal(err: unknown): HandleRefusal | null {
  if (!(err instanceof XrpcError) || err.status !== 400) return null;
  if (err.error === "HandleNotAvailable" || err.error === "InvalidHandle") {
    return "unavailable";
  }
  if (
    err.error === "InvalidRequest" &&
    /handle already taken|email already taken/i.test(err.message)
  ) {
    return "taken";
  }
  return null;
}

/** Whether the pds turned a handle down at all (see handleRefusal). */
export function isHandleRefusal(err: unknown): boolean {
  return handleRefusal(err) !== null;
}

/** Records equal as lex values (cids compared as cids); false on odd input. */
function sameRecord(a: Record<string, LexValue>, b: unknown): boolean {
  try {
    return lexEquals(a, b as LexValue);
  } catch {
    return false;
  }
}
