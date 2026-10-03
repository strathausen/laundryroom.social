import { env } from "../../env";
import { publicOrigin } from "./config";

/**
 * laundryroom's own atproto identity: the did of the appview (later the
 * audience of service-auth tokens and of rpc/include scopes, so it is baked
 * into every grant; decided once). did:web:laundryroom.social resolves to
 * https://laundryroom.social/.well-known/did.json, which the apex serves
 * without its usual 301 to www (ops/nginx/laundryroom-wellknown.conf):
 * atproto did:web resolvers refuse redirects.
 */
export const APPVIEW_DID = "did:web:laundryroom.social";
/** the services live on www, so requests to them never meet the apex redirect */
export const APPVIEW_SERVICE_ENDPOINT = "https://www.laundryroom.social";

/**
 * The appview did for this deployment: APPVIEW_DID in production, in
 * development a did:web of APP_URL's host (the port percent-encoded, as
 * did:web requires: http://localhost:3000 -> did:web:localhost%3A3000).
 */
export function appviewDid(): string {
  const origin = publicOrigin();
  if (env.NODE_ENV === "production" || !origin) return APPVIEW_DID;
  const { hostname, port } = new URL(origin);
  return `did:web:${hostname}${port ? `%3A${port}` : ""}`;
}

/** the did document served at /.well-known/did.json */
export function appviewDidDocument() {
  const origin = publicOrigin();
  const serviceEndpoint =
    env.NODE_ENV === "production" || !origin
      ? APPVIEW_SERVICE_ENDPOINT
      : origin;
  return {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: appviewDid(),
    service: [
      {
        id: "#laundryroom_appview",
        type: "LaundryroomAppView",
        serviceEndpoint,
      },
    ],
  };
}
