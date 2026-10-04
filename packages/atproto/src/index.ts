// nsids, lexicons, generated types, local validation, the GroupHost /
// GroupContentStore interfaces and the pure group-account rules (handles,
// the public profile, what a group may publish). every nsid and action
// string lives in src/nsid.ts and nowhere else; see docs/atproto-plan.md,
// "nsids and how stable they are". src/lexicons/ is generated from
// lexicons/ by `pnpm -F @laundryroom/atproto lex:build`; never edit it by
// hand.
export * from "./nsid";
export * from "./validate";
export type * from "./interfaces";
export * from "./groups/handle";
export * from "./groups/profile";
export * as lexicons from "./lexicons";
