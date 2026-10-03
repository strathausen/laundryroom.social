import type { Jwk } from "@atproto/oauth-client-node";
import { JoseKey } from "@atproto/oauth-client-node";

import { env } from "../../env";

/**
 * The confidential client's signing keys (private_key_jwt, ES256). Each
 * authorization server binds a session to the key that started it, so a
 * rotation adds the new key and keeps the old one until every session signed
 * with it has expired (about three months on bsky.social): add one line below,
 * newest first, plus the env var in packages/auth/env.ts. /oauth/jwks.json
 * publishes every key listed here.
 */
const KEY_SOURCES: readonly { kid: string; jwk: () => string | undefined }[] = [
  { kid: "k1", jwk: () => env.ATPROTO_OAUTH_PRIVATE_JWK },
  // { kid: "k2", jwk: () => env.ATPROTO_OAUTH_PRIVATE_JWK_K2 },
];

async function importKey(kid: string, json: string): Promise<JoseKey> {
  let jwk: unknown;
  try {
    jwk = JSON.parse(json);
  } catch {
    // never echo the value: it is a private key
    throw new Error(`atproto oauth key ${kid} is not valid JSON`);
  }
  if (typeof jwk !== "object" || jwk === null || Array.isArray(jwk)) {
    throw new Error(`atproto oauth key ${kid} is not a JWK object`);
  }
  const { use, ...rest } = jwk as Record<string, unknown>;
  // @atproto/jwk-jose 0.2 deprecates "use" on private keys (it warns on every
  // start and will reject it later); "key_ops": ["sign"] says the same thing
  const normalized =
    use === "sig" && rest.key_ops === undefined
      ? { ...rest, key_ops: ["sign"] }
      : use === undefined
        ? rest
        : { ...rest, use };
  const key = await JoseKey.fromImportable(normalized as Jwk, kid);
  if (!key.isPrivate || !key.algorithms.includes("ES256")) {
    throw new Error(`atproto oauth key ${kid} must be a private ES256 key`);
  }
  return key;
}

let keysPromise: Promise<JoseKey[]> | undefined;

/**
 * The private keys, imported on first use (never at build time: the image is
 * built without secrets). A failed import is retried on the next call.
 */
export function loadSigningKeys(): Promise<JoseKey[]> {
  keysPromise ??= (async () => {
    const keys: JoseKey[] = [];
    for (const { kid, jwk } of KEY_SOURCES) {
      const json = jwk();
      if (json) keys.push(await importKey(kid, json));
    }
    if (keys.length === 0) {
      throw new Error("ATPROTO_OAUTH_PRIVATE_JWK is not set");
    }
    return keys;
  })().catch((err: unknown) => {
    keysPromise = undefined;
    throw err;
  });
  return keysPromise;
}

/**
 * The public halves of the signing keys, as served at /oauth/jwks.json.
 * Private members ("d") never leave this function.
 */
export async function atprotoPublicJwks(): Promise<{ keys: Jwk[] }> {
  const keys = await loadSigningKeys();
  return {
    keys: keys.map((key) => {
      // publicJwk keeps the private members as keys with undefined values;
      // the json round trip drops them, the check makes sure of it
      const publicJwk = key.publicJwk
        ? (JSON.parse(JSON.stringify(key.publicJwk)) as Jwk)
        : undefined;
      if (!publicJwk || "d" in publicJwk || "k" in publicJwk) {
        throw new Error(`atproto oauth key ${key.kid} has no public form`);
      }
      return publicJwk;
    }),
  };
}
