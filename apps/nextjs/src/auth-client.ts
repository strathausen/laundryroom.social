import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * browser-side better auth client. no baseURL: the auth routes live on the
 * same origin under /api/auth, which is the client's default.
 */
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});
