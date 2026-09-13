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
