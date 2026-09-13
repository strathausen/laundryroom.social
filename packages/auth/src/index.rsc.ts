// `cache` is only typed in react's canary build (next 14 ships against it);
// nothing in this package's import graph pulls in next's types any more
/// <reference types="react/canary" />
import { cache } from "react";

import { getSession as uncachedGetSession } from "./index";

export * from "./index";

/**
 * React server components resolve the session in several places per request
 * (the locale layout, the group layout, the server-side tRPC caller). `cache`
 * de-duplicates those calls for the same `headers()` instance, so better-auth
 * is asked once per request.
 */
export const getSession = cache(uncachedGetSession);
