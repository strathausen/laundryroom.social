import { toNextJsHandler } from "better-auth/next-js";

import { auth, withAtprotoErrorRedirect } from "@laundryroom/auth";

// google oauth callback (/api/auth/callback/google), magic link request and
// verify (/api/auth/sign-in/magic-link, /api/auth/magic-link/verify), atproto
// sign-in and callback (/api/auth/atproto/*), session and sign-out endpoints
// are all served by better auth from here
const handlers = toNextJsHandler(auth);

// the atproto endpoints are full-page navigations: a rate-limited one, or a
// sign-in better auth's origin check refuses, goes back to the login page
// with an error instead of showing a bare 429 / 403
export function GET(request: Request) {
  return withAtprotoErrorRedirect(request, handlers.GET);
}

export function POST(request: Request) {
  return withAtprotoErrorRedirect(request, handlers.POST);
}
