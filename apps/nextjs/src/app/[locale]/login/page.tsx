import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { atprotoLoginStatus, getSession } from "@laundryroom/auth";

import {
  atprotoErrorKey,
  isAtprotoError,
  isAtprotoHandleError,
} from "~/app/_components/atproto/errors";
import { LoginForm } from "~/app/_components/login-form";
import {
  firstParam,
  localizedCallbackUrl,
  safeCallbackUrl,
} from "~/lib/callback-url";

export const metadata: Metadata = {
  title: "login | laundryroom.social",
  robots: { index: false, follow: false },
};

// better auth sends failed magic links and oauth callbacks back here with
// ?error=<code>. the codes are upstream's (better-auth 1.7: the magic-link
// verify endpoint and the oauth callback), the copy is ours, under
// `login.errors` in messages/*.json. the atproto plugin's codes
// (atproto_<code>) are handled by ~/app/_components/atproto/errors.
const errorKeys = new Map<string, string>([
  // magic link: a used, expired or mangled token all come back as this
  ["INVALID_TOKEN", "invalidToken"],
  // google: the person pressed cancel on google's consent screen
  ["access_denied", "googleCancelled"],
  ["no_code", "googleIncomplete"],
  ["invalid_code", "googleIncomplete"],
  ["unable_to_get_user_info", "googleIncomplete"],
  ["email_not_found", "googleNoEmail"],
  ["email_does_not_match", "googleEmailMismatch"],
  ["unable_to_link_account", "googleLinkFailed"],
  ["account_already_linked_to_different_user", "googleAlreadyLinked"],
]);

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
    /** what was typed before a failed atproto attempt (the plugin echoes it) */
    handle?: string | string[];
  }>;
}

export default async function LoginPage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const callbackUrl = safeCallbackUrl(searchParams.callbackUrl);
  const errorCode = firstParam(searchParams.error);
  // only ever a form value (react escapes it); capped like the plugin does
  const handle = firstParam(searchParams.handle)?.slice(0, 256);
  const session = await getSession(await headers());
  if (session) {
    // connecting an atproto account from the profile page fails back to this
    // page like a sign-in does, but the person is signed in: show the error
    // next to the form they came from (#atproto, scrolled into view) instead
    // of bouncing them to the home page. isAtprotoError only matches a fixed
    // prefix, and the profile page looks the code up in a fixed list before
    // showing anything.
    if (isAtprotoError(errorCode)) {
      const params = new URLSearchParams({ error: errorCode });
      if (handle) params.set("handle", handle);
      redirect(`/${locale}/edit-profile?${params.toString()}#atproto`);
    }
    redirect(callbackUrl);
  }

  // only what the forms need goes to the client: its props end up in the
  // page html
  const { enabled, signupHost } = atprotoLoginStatus();
  const t = await getTranslations("login");
  const tAtproto = await getTranslations("atproto");
  // never echo the code itself: anyone can put text into ?error= and it would
  // show up on the real login page
  let error: string | undefined;
  if (isAtprotoError(errorCode)) {
    error = tAtproto(atprotoErrorKey(errorCode));
  } else if (errorCode) {
    error = t(`errors.${errorKeys.get(errorCode) ?? "signInFailed"}`);
  }

  return (
    <main className="container flex min-h-screen flex-col items-center gap-4 py-16">
      <h1 className="text-center text-3xl font-bold text-black">
        {t("title")}
      </h1>
      <p className="text-center text-black">{t("subtitle")}</p>
      <LoginForm
        callbackUrl={callbackUrl}
        error={error}
        atproto={{
          enabled,
          signupHost,
          // the atproto sign-in lands on exactly this path and reads the
          // locale for its error pages off it; google and magic links keep
          // the bare one (their errors go through the locale middleware)
          callbackURL: localizedCallbackUrl(callbackUrl, locale),
          failed: isAtprotoError(errorCode)
            ? { invalid: isAtprotoHandleError(errorCode), handle }
            : undefined,
        }}
      />
    </main>
  );
}
