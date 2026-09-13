import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSession } from "@laundryroom/auth";

import { LoginForm } from "~/app/_components/login-form";
import { firstParam, safeCallbackUrl } from "~/lib/callback-url";

export const metadata: Metadata = {
  title: "login | laundryroom.social",
  robots: { index: false, follow: false },
};

// better auth sends failed magic links and oauth callbacks back here with
// ?error=<code>. the codes are upstream's (better-auth 1.7: the magic-link
// verify endpoint and the oauth callback), the copy is ours.
const errorMessages: Record<string, string> = {
  // magic link: a used, expired or mangled token all come back as this
  INVALID_TOKEN: "this link is no longer valid, request a new one",
  // google: the person pressed cancel on google's consent screen
  access_denied: "google sign-in was cancelled",
  no_code: "google sign-in did not complete, please try again",
  invalid_code: "google sign-in did not complete, please try again",
  unable_to_get_user_info: "google sign-in did not complete, please try again",
  email_not_found: "google did not share an email address for that account",
  email_does_not_match: "that google account uses a different email",
  unable_to_link_account:
    "this google account could not be linked to your profile",
  account_already_linked_to_different_user:
    "this google account already belongs to another profile",
};

function describeError(code: string | undefined) {
  if (!code) return undefined;
  // never echo the code itself: anyone can put text into ?error= and it would
  // show up on the real login page
  return errorMessages[code] ?? "sign in failed, please try again";
}

interface Props {
  searchParams: {
    callbackUrl?: string | string[];
    error?: string | string[];
  };
}

export default async function LoginPage({ searchParams }: Props) {
  const callbackUrl = safeCallbackUrl(searchParams.callbackUrl);
  const session = await getSession(headers());
  if (session) {
    redirect(callbackUrl);
  }
  const error = describeError(firstParam(searchParams.error));

  return (
    <main className="container flex min-h-screen flex-col items-center gap-4 py-16">
      <h1 className="text-center text-3xl font-bold text-black">login</h1>
      <p className="text-center text-black">
        sign in to join groups, rsvp to meetups and talk to people
      </p>
      <LoginForm callbackUrl={callbackUrl} error={error} />
    </main>
  );
}
