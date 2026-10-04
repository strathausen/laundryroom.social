// nsids, lexicons, generated types, local validation and the GroupHost /
// GroupContentStore interfaces. every nsid and action string lives in
// src/nsid.ts and nowhere else; see docs/atproto-plan.md, "nsids and how
// stable they are". src/lexicons/ is generated from lexicons/ by
// `pnpm -F @laundryroom/atproto lex:build`; never edit it by hand.
export * from "./nsid";
export * from "./validate";
export type * from "./interfaces";
export * as lexicons from "./lexicons";
