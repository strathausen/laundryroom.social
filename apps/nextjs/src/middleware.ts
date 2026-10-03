import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

// Locale negotiation only. Wrapping it in Auth.js' `auth()` pulled the database
// adapter, and with it node-postgres, into the edge middleware bundle, where
// `net`/`tls` do not exist; `req.auth` was unused here anyway (next-intl ignores
// it) and every page and api route resolves the session server-side itself.
const intlMiddleware = createMiddleware(routing);

export default function middleware(request: NextRequest) {
  // next inlines NODE_ENV, so production builds drop this branch
  // eslint-disable-next-line no-restricted-properties
  if (process.env.NODE_ENV !== "production") {
    const target = loopbackTarget(request);
    if (target) return refreshTo(target);
  }
  return intlMiddleware(request);
}

/**
 * Development with a loopback APP_URL (the keyless atproto loopback client,
 * see packages/auth/src/atproto/config.ts): the authorization server only
 * calls back to http://127.0.0.1:<port>, and cookies are per host, so the app
 * has to run on 127.0.0.1. A page opened on localhost or [::1] (what `next
 * dev` prints) moves there before it renders, so every form on it posts
 * same-origin from 127.0.0.1. Kept free of imports: the env module and the
 * auth package do not belong in the edge bundle.
 */
function loopbackTarget(request: NextRequest): URL | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  // the same origin atprotoClientMode looks at
  // eslint-disable-next-line no-restricted-properties
  const appUrl = process.env.APP_URL ?? process.env.AUTH_URL;
  if (!appUrl || !isLoopbackUrl(appUrl)) return null;
  // the Host header, not request.url: next builds that from its own idea of
  // the host
  const host = request.headers.get("host");
  if (!host) return null;
  let incoming: URL;
  try {
    incoming = new URL(`http://${host}`);
  } catch {
    return null;
  }
  if (incoming.hostname !== "localhost" && incoming.hostname !== "[::1]") {
    return null;
  }
  const port = incoming.port ? `:${incoming.port}` : "";
  const { pathname, search } = request.nextUrl;
  return new URL(`http://127.0.0.1${port}${pathname}${search}`);
}

/**
 * A refresh rather than a 307: next treats localhost, [::1] and 127.0.0.1 as
 * one host and rewrites a middleware Location between them back to the
 * request's host (or to a relative path), which would loop.
 */
function refreshTo(target: URL): NextResponse {
  const href = target.href.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new NextResponse(
    `<!doctype html><meta http-equiv="refresh" content="0;url=${href}"><a href="${href}">${href}</a>`,
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        refresh: `0;url=${target.href}`,
        "cache-control": "no-store",
      },
    },
  );
}

function isLoopbackUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
    );
  } catch {
    return false;
  }
}

// Read more: https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
export const config = {
  matcher: [
    // Enable a redirect to a matching locale at the root
    "/",
    // Set a cookie to remember the previous locale for
    // all requests that have a locale prefix.
    // Next.js needs matcher entries to be static string literals, so this
    // list cannot be computed from `routing.locales` — keep it in sync with
    // `locales` in ./i18n/routing.ts by hand.
    "/(de|en|es|fr|ro)/:path*",
    // Everything else, except api routes, next.js internals and any path with
    // a file extension (public/ assets like /og-default.png and /favicon.ico,
    // the generated /sitemap.xml). Middleware runs before the public/ folder
    // is checked, and next-intl would redirect such paths to /<locale>/...,
    // which then 404s in the app tree.
    "/((?!api|_next|_vercel|.*\\..*).*)",
  ],
};
