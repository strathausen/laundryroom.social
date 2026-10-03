import { atprotoHostedJwks } from "@laundryroom/auth/atproto";

// the jwks_uri of the atproto oauth client: the public halves of the keys it
// signs its token requests with (private_key_jwt). Fetched by authorization
// servers with redirect: "error", like the client metadata.
export const dynamic = "force-dynamic";

export async function GET() {
  let jwks: Awaited<ReturnType<typeof atprotoHostedJwks>>;
  try {
    jwks = await atprotoHostedJwks();
  } catch (err) {
    console.error("[atproto] serving the jwks failed", err);
    return Response.json(
      { error: "server_error" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
  if (!jwks) {
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  return Response.json(jwks, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
