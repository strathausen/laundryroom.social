// The worker side of group accounts: LocalPdsGroupHost, the custodied
// credentials and what the group.* jobs run. Import it from apps/worker
// only: it reads the admin password and decrypts group credentials, which
// never reach a request, a client or a log.
export type { GroupAccountsConfig } from "./config";
export {
  groupAccountsConfig,
  groupAccountsConfigProblem,
  readGroupAccountsConfig,
} from "./config";
export { CredentialCipher, credentialKeyId } from "./cipher";
export { credentialContext } from "./db-store";
export {
  describeError,
  GroupAccountError,
  isCredentialError,
  isPermanentGroupAccountError,
  sanitizedError,
} from "./errors";
export {
  handleRefusal,
  isHandleRefusal,
  LocalPdsGroupHost,
  WRITER_APP_PASSWORD_NAME,
} from "./local-pds-group-host";
export type { GroupCredentialStore, StoredGroupCredential } from "./store";
export { MemoryGroupCredentialStore } from "./store";
export type { BackfillCursor, FollowUp, GroupAccountOutcome } from "./sync";
export {
  countGroupAccounts,
  GROUP_PUBLISH_GRACE_SECONDS,
  groupIdsToTakeDown,
  groupIdsWithAccount,
  groupsWithoutAccount,
  recoverGroupCredential,
  retireGroupAccount,
  syncGroupAccount,
} from "./sync";
