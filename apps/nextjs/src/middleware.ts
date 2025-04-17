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
    // all requests that have a locale prefix
    "/(de|en|fr|id|ko|ro|vi|he)/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml).*)",
  ],
};
