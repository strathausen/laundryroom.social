import type { Metadata } from "next";

import { Button } from "@laundryroom/ui/button";

import { Link } from "~/i18n/routing";
import { firstParam, safeCallbackUrl } from "~/lib/callback-url";

export const metadata: Metadata = {
  title: "confirm sign-in | laundryroom.social",
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    token?: string | string[];
    callbackURL?: string | string[];
  }>;
}

/**
 * scanner-proof landing page for magic links.
 *
 * corporate mail filters open every link in an email to check it. if the link
 * itself consumed the token (better auth's default /api/auth/magic-link/verify
 * does) the scanner would sign in instead of the person and burn the token.
 * so the email points here, and the token only reaches the verify endpoint
 * through a plain html form submit that needs a real click: no auto-submit,
 * no javascript redirect.
 */
export default async function ConfirmSignInPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const token = firstParam(searchParams.token);
  const callbackURL = safeCallbackUrl(searchParams.callbackURL);
  // used or expired tokens send the person back to the login page with ?error=
  const errorCallbackURL = `/${params.locale}/login?callbackUrl=${encodeURIComponent(callbackURL)}`;

  return (
    <main className="container flex min-h-screen flex-col items-center gap-4 py-16">
      <h1 className="text-center text-3xl font-bold text-black">
        almost there
      </h1>
      {token ? (
        <>
          <p className="text-center text-black">
            press the button to finish signing in.
          </p>
          <form method="get" action="/api/auth/magic-link/verify">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="callbackURL" value={callbackURL} />
            <input
              type="hidden"
              name="errorCallbackURL"
              value={errorCallbackURL}
            />
            <Button type="submit" size="lg">
              sign me in
            </Button>
          </form>
          <p className="max-w-md text-center text-sm text-gray-500">
            why the extra click? some email providers open every link in a
            message to scan it before you do. if this link signed you in by
            itself, those scanners would use up your login before you got the
            chance. the button only reacts to a real click.
          </p>
        </>
      ) : (
        <>
          <p className="text-center text-black">
            this link is incomplete, please request a new one.
          </p>
          <Link
            href="/login"
            className="underline decoration-green-400 decoration-4 underline-offset-4"
          >
            back to login
          </Link>
        </>
      )}
    </main>
  );
}
