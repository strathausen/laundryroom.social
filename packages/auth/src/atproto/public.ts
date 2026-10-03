import type { Jwk, OAuthClientMetadataInput } from "@atproto/oauth-client-node";

import { atprotoClientMetadata, atprotoClientMode } from "./config";
import { atprotoPublicJwks } from "./keys";

/**
 * `@laundryroom/auth/atproto`: what the public atproto documents need, without
 * better-auth or the database (the route handlers for
 * /oauth-client-metadata.json, /oauth/jwks.json and /.well-known/did.json).
 */

export { APPVIEW_DID, appviewDid, appviewDidDocument } from "./did";
export { ATPROTO_SCOPE, ATPROTO_SCOPES, atprotoLoginStatus } from "./config";

/**
 * The client metadata document (the client id) of the confidential client,
 * null when there is none (development uses the loopback client, whose
 * metadata the authorization server derives from its client id).
 */
export function atprotoHostedClientMetadata(): OAuthClientMetadataInput | null {
  const mode = atprotoClientMode();
  return mode.kind === "confidential" ? atprotoClientMetadata(mode) : null;
}

/**
 * The public keys of the confidential client (its jwks_uri), null when
 * there is no confidential client. Throws when the configured key is broken.
 */
export async function atprotoHostedJwks(): Promise<{ keys: Jwk[] } | null> {
  return atprotoClientMode().kind === "confidential"
    ? atprotoPublicJwks()
    : null;
}
