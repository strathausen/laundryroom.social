import { atprotoHostedClientMetadata } from "@laundryroom/auth/atproto";

// the atproto oauth client id: authorization servers fetch this document (with
// redirect: "error", so it must be served from APP_URL's own host without a
// redirect) to learn the client's redirect uri, scopes and jwks_uri. Outside
// [locale]: the path has a dot, so the next-intl middleware leaves it alone.
// Read at request time, the build has no env.
export const dynamic = "force-dynamic";

export function GET() {
  const metadata = atprotoHostedClientMetadata();
  if (!metadata) {
    // no confidential client here (development uses the loopback client)
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(metadata, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
