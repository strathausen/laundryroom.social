// Group accounts on pds.lndry.social (docs/atproto-plan.md, phase 3), for
// the web app: whether the feature is on, and the rules for what a group
// may publish. Nothing here talks to the pds or reads a secret (the admin
// password and the credential keys are the worker's alone); that is
// `@laundryroom/group-accounts/worker`.
export { groupAccountsEnabled } from "./enabled";
export {
  isReadableGroupHandle,
  publishesOnNetwork,
} from "@laundryroom/atproto";
