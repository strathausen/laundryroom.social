import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

// Locale negotiation only. Wrapping it in Auth.js' `auth()` pulled the database
// adapter, and with it node-postgres, into the edge middleware bundle, where
// `net`/`tls` do not exist; `req.auth` was unused here anyway (next-intl ignores
// it) and every page and api route resolves the session server-side itself.
export default createMiddleware(routing);

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
