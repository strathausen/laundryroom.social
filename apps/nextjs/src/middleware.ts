import createMiddleware from "next-intl/middleware";

import { auth } from "@laundryroom/auth";

import { routing } from "./i18n/routing";

const i18n = createMiddleware(routing);

export default auth(i18n);

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
