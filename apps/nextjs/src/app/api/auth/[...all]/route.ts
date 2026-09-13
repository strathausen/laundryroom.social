import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@laundryroom/auth";

// google oauth callback (/api/auth/callback/google), magic link request and
// verify (/api/auth/sign-in/magic-link, /api/auth/magic-link/verify), session
// and sign-out endpoints are all served by better auth from here
export const { GET, POST } = toNextJsHandler(auth);
