"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { ATPROTO_SIGN_IN_PATH, cleanHandle } from "~/auth-client";

/**
 * true from the moment the form is on its way to the authorization server.
 * coming back with the back button can restore this page from the
 * back/forward cache with its state intact, buttons still disabled, so a
 * restored page starts over.
 */
function useRedirecting() {
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setRedirecting(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
  return [redirecting, setRedirecting] as const;
}

interface HandleFormProps {
  /** same-origin relative path to land on afterwards, already validated */
  callbackURL: string;
  /** connect the account to the signed-in user instead of signing in */
  link?: boolean;
  submitLabel: string;
  /** what the person typed before a failed attempt, to fix rather than retype */
  defaultHandle?: string;
  /** id of the error message shown for a failed attempt, if there is one */
  errorId?: string;
  /** that error is about the handle itself (not a handle, not found) */
  invalid?: boolean;
}

/**
 * handle field that starts an atproto sign-in (or link): a plain form post
 * to the sign-in endpoint, so it works the same without javascript and
 * before hydration. the server cleans the handle up ("@alice.bsky.social "
 * -> "alice.bsky.social"); here it only drives the hints.
 */
export function AtprotoHandleForm({
  callbackURL,
  link,
  submitLabel,
  defaultHandle,
  errorId,
  invalid,
}: HandleFormProps) {
  const t = useTranslations("atproto");
  const id = useId();
  const [handle, setHandle] = useState(defaultHandle ?? "");
  const [redirecting, setRedirecting] = useRedirecting();
  const cleaned = cleanHandle(handle);
  // people who signed up with google or email type that address here
  const looksLikeEmail = cleaned.includes("@");
  const describedBy = [
    `${id}-hint`,
    looksLikeEmail ? `${id}-email` : null,
    errorId ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      method="post"
      action={ATPROTO_SIGN_IN_PATH}
      className="flex flex-col gap-3"
      aria-busy={redirecting}
      onSubmit={(e) => {
        // a second press while the first is on its way, or only whitespace
        if (redirecting || !cleaned) {
          e.preventDefault();
          return;
        }
        // the browser posts the form itself
        setRedirecting(true);
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-handle`}>{t("handleLabel")}</label>
        <Input
          id={`${id}-handle`}
          type="text"
          name="handle"
          autoComplete="username"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("handlePlaceholder")}
          aria-describedby={describedBy}
          aria-invalid={invalid ? true : undefined}
          // after a failed attempt, the retry starts right here
          autoFocus={!!errorId}
          required
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          readOnly={redirecting}
        />
        <p id={`${id}-hint`} className="text-sm text-gray-500">
          {t("explainer")}
        </p>
        <p aria-live="polite" className="text-sm text-red-700">
          {looksLikeEmail && (
            <span id={`${id}-email`}>{t("looksLikeEmail")}</span>
          )}
        </p>
      </div>
      <input type="hidden" name="callbackURL" value={callbackURL} />
      {link && <input type="hidden" name="link" value="1" />}
      {/* never disabled while idle: a disabled default button would block
          submitting with enter before hydration, and `required` already
          stops an empty field */}
      <Button
        type="submit"
        size="lg"
        className="h-auto min-h-10 whitespace-normal py-2"
        disabled={redirecting}
      >
        {redirecting ? t("redirecting") : submitLabel}
      </Button>
    </form>
  );
}

/** "no account yet? create one on <host>", only rendered when sign-up is on */
export function AtprotoSignUp({
  callbackURL,
  host,
}: {
  callbackURL: string;
  /** the pds the button sends people to (ATPROTO_SIGNUP_PDS_URL) */
  host: string;
}) {
  const t = useTranslations("atproto");
  const [redirecting, setRedirecting] = useRedirecting();

  return (
    <form
      method="post"
      action={ATPROTO_SIGN_IN_PATH}
      className="flex flex-wrap items-baseline gap-x-2 text-sm"
      aria-busy={redirecting}
      onSubmit={(e) => {
        if (redirecting) {
          e.preventDefault();
          return;
        }
        setRedirecting(true);
      }}
    >
      <input type="hidden" name="signup" value="1" />
      <input type="hidden" name="callbackURL" value={callbackURL} />
      <span>{t("noAccount")}</span>
      <button
        type="submit"
        disabled={redirecting}
        className="underline decoration-green-400 decoration-4 underline-offset-4 disabled:opacity-50"
      >
        {redirecting ? t("redirecting") : t("createAccount", { host })}
      </button>
    </form>
  );
}
