import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { atprotoLoginStatus, auth } from "@laundryroom/auth";

import { AtprotoAccount } from "~/app/_components/atproto/account";
import {
  atprotoErrorKey,
  isAtprotoError,
  isAtprotoHandleError,
} from "~/app/_components/atproto/errors";
import { EditProfileForm } from "~/app/_components/profile-edit";
import { firstParam } from "~/lib/callback-url";
import { HydrateClient } from "~/trpc/server";

interface Props {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string | string[];
    handle?: string | string[];
  }>;
}

export default async function EditProfilePage(props: Props) {
  const [{ locale }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  // past the 5-minute cookie cache: right after connecting an atproto account
  // the cached user would not have its did and handle yet
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  const { enabled } = atprotoLoginStatus();
  // a failed connect attempt ends up on the login page, which sends signed-in
  // people here with the code (see [locale]/login/page.tsx)
  const errorCode = firstParam(searchParams.error);
  const tAtproto = await getTranslations("atproto");
  const atprotoError = isAtprotoError(errorCode)
    ? {
        message: tAtproto(atprotoErrorKey(errorCode)),
        invalid: isAtprotoHandleError(errorCode),
        handle: firstParam(searchParams.handle)?.slice(0, 256),
      }
    : undefined;

  return (
    <HydrateClient>
      <main className="container flex min-h-screen flex-col gap-4 py-16">
        <h1 className="text-center text-3xl font-bold text-black">
          your profile
        </h1>
        <p className="text-center text-black">
          this is a place to tell the world about yourself
        </p>
        <div className="flex flex-col items-center justify-center gap-4">
          <EditProfileForm />
          {session && (
            <AtprotoAccount
              did={session.user.did}
              handle={session.user.handle}
              enabled={enabled}
              // #atproto: the block sits below the long profile form
              callbackURL={`/${locale}/edit-profile#atproto`}
              error={atprotoError}
            />
          )}
        </div>
      </main>
    </HydrateClient>
  );
}
