import { appviewDidDocument } from "@laundryroom/auth/atproto";

// did:web:laundryroom.social resolves to https://laundryroom.social/.well-known/did.json.
// The apex 301s everything else to www, and did:web resolvers refuse
// redirects, so nginx proxies this one path on the apex straight to the app
// (ops/nginx/laundryroom-wellknown.conf). www serves it too.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(appviewDidDocument(), {
    headers: { "cache-control": "public, max-age=300" },
  });
}
