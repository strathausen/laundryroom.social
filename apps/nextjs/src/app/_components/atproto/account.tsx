import { useId } from "react";
import { useTranslations } from "next-intl";

import { Box } from "@laundryroom/ui/box";

import { AtprotoHandleForm } from "./sign-in";

interface Props {
  /** did of the connected atproto account; null when none is connected */
  did: string | null | undefined;
  /** its handle as cached at the last sign-in (null if it never resolved) */
  handle: string | null | undefined;
  /** atproto sign-in is configured on this deployment */
  enabled: boolean;
  /** where to come back to after connecting, already validated */
  callbackURL: string;
  /** a failed connect attempt: its localized message, and what was typed */
  error?: { message: string; invalid: boolean; handle?: string };
}

/**
 * "your atproto account" on the profile page: the connected handle, or a
 * handle field that links an account to the signed-in user. linking goes
 * through the same sign-in endpoint with link=1; the callback attaches the
 * did to this user, or refuses when it already belongs to someone else.
 */
export function AtprotoAccount({
  did,
  handle,
  enabled,
  callbackURL,
  error,
}: Props) {
  const t = useTranslations("atproto");
  const errorId = useId();

  // nothing to show and nothing to do: no account, and no way to connect one
  if (!did && !enabled) return null;

  return (
    // the target of /edit-profile#atproto: failed and successful connects
    // land here, below the long profile form, scrolled into view
    <div id="atproto" className="w-full max-w-md scroll-mt-8">
      <Box className="flex w-full flex-col gap-3">
        <h2 className="text-xl font-bold">
          {did ? t("accountTitle") : t("connectTitle")}
        </h2>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="border-2 border-red-500 bg-red-50 p-3 text-red-700"
          >
            {error.message}
          </p>
        )}
        {did ? (
          <>
            <p className="break-all">
              {t.rich("connectedAs", {
                account: handle ? `@${handle}` : did,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
            <p className="text-sm text-gray-500">{t("connectedHint")}</p>
          </>
        ) : (
          <>
            <p>{t("connectHint")}</p>
            <AtprotoHandleForm
              callbackURL={callbackURL}
              link
              submitLabel={t("connect")}
              defaultHandle={error?.handle}
              errorId={error ? errorId : undefined}
              invalid={error?.invalid}
            />
          </>
        )}
      </Box>
    </div>
  );
}
