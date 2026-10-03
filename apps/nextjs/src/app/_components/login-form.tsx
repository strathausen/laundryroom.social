"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { FaGoogle } from "react-icons/fa6";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { authClient } from "~/auth-client";
import { AtprotoHandleForm, AtprotoSignUp } from "./atproto/sign-in";

interface Props {
  /** same-origin relative path to land on after signing in, already validated */
  callbackUrl: string;
  /** message for a failed previous attempt (from ?error=), shown above the form */
  error?: string;
  /** which atproto options this deployment offers (packages/auth) */
  atproto: {
    enabled: boolean;
    /** the sign-up pds's host, null when sign-up is off */
    signupHost: string | null;
    /** callbackUrl with the locale in front, for the atproto forms */
    callbackURL: string;
    /** `error` came from a failed atproto attempt */
    failed?: {
      /** the handle itself was the problem (not a handle, not found) */
      invalid: boolean;
      /** what was typed, to fix rather than retype */
      handle?: string;
    };
  };
}

type Status = "idle" | "sending" | "sent";

function OrDivider() {
  const t = useTranslations("login");
  return (
    <div className="flex items-center gap-3 text-sm text-gray-500">
      <hr className="flex-1 border-black" />
      {t("or")}
      <hr className="flex-1 border-black" />
    </div>
  );
}

export function LoginForm({ callbackUrl, error, atproto }: Props) {
  const t = useTranslations("login");
  const tAtproto = useTranslations("atproto");
  const [email, setEmail] = useState("");
  // honeypot: people never see this field, bots fill in everything they find.
  // this only stops bots that drive the form; anything posting straight to
  // /api/auth/sign-in/magic-link skips it, and there the rate limit in
  // packages/auth (3 requests per 5 minutes per ip) is the real control
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [googlePending, setGooglePending] = useState(false);
  const [message, setMessage] = useState(error);
  const messageId = useId();
  // the handle field points at the message while it is the atproto one
  const atprotoFailed =
    atproto.failed && message === error ? atproto.failed : undefined;
  // failed magic links and oauth callbacks come back to this page with ?error=
  const errorCallbackURL = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  const describeApiError = (apiError: { status: number; message?: string }) => {
    if (apiError.status === 429) return t("errors.tooManyAttempts");
    // better auth's own message is english; better than nothing
    return apiError.message?.toLowerCase() ?? t("errors.generic");
  };

  const signInWithGoogle = async () => {
    setMessage(undefined);
    setGooglePending(true);
    const { error: apiError } = await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackUrl,
      errorCallbackURL,
    });
    // on success the client navigates to google itself, so this only runs on failure
    if (apiError) {
      setMessage(describeApiError(apiError));
      setGooglePending(false);
    }
  };

  const requestMagicLink = async () => {
    setMessage(undefined);
    if (website) {
      // a bot filled the hidden field: pretend it worked, send nothing
      setStatus("sent");
      return;
    }
    setStatus("sending");
    const { error: apiError } = await authClient.signIn.magicLink({
      email,
      callbackURL: callbackUrl,
      errorCallbackURL,
    });
    if (apiError) {
      setMessage(describeApiError(apiError));
      setStatus("idle");
      return;
    }
    setStatus("sent");
  };

  if (status === "sent") {
    return (
      <Box className="flex w-full max-w-md flex-col gap-4">
        <h2 className="text-xl font-bold">{t("sentTitle")}</h2>
        <p>
          {t.rich("sentBody", {
            email,
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </p>
        <p className="text-sm text-gray-500">{t("sentHint")}</p>
        <Button
          type="button"
          variant="plattenbau"
          onClick={() => setStatus("idle")}
        >
          {t("useDifferentEmail")}
        </Button>
      </Box>
    );
  }

  return (
    <Box className="relative flex w-full max-w-md flex-col gap-6">
      {message && (
        <p
          id={messageId}
          role="alert"
          className="border-2 border-red-500 bg-red-50 p-3 text-red-700"
        >
          {message}
        </p>
      )}
      {atproto.enabled && (
        <>
          <div className="flex flex-col gap-4">
            <p className="font-bold">{tAtproto("signInLead")}</p>
            <AtprotoHandleForm
              callbackURL={atproto.callbackURL}
              submitLabel={tAtproto("continue")}
              defaultHandle={atproto.failed?.handle}
              errorId={atprotoFailed ? messageId : undefined}
              invalid={atprotoFailed?.invalid}
            />
            {atproto.signupHost && (
              <AtprotoSignUp
                callbackURL={atproto.callbackURL}
                host={atproto.signupHost}
              />
            )}
          </div>
          <OrDivider />
        </>
      )}
      <Button
        type="button"
        size="lg"
        // long translations wrap instead of spilling out at phone width
        className="flex h-auto min-h-10 items-center gap-2 whitespace-normal py-2"
        onClick={signInWithGoogle}
        disabled={googlePending}
      >
        <FaGoogle aria-hidden="true" /> {t("continueWithGoogle")}
      </Button>
      <OrDivider />
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await requestMagicLink();
        }}
      >
        <label className="flex flex-col gap-1">
          <span>{t("emailLabel")}</span>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "sending"}
          />
        </label>
        <div
          aria-hidden="true"
          className="absolute left-[-9999px] top-0 h-px w-px overflow-hidden"
        >
          <label>
            website
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>
        <Button
          type="submit"
          size="lg"
          className="h-auto min-h-10 whitespace-normal py-2"
          disabled={status === "sending" || !email}
        >
          {status === "sending" ? t("emailSending") : t("emailSubmit")}
        </Button>
      </form>
      <p className="text-sm text-gray-500">{t("emailHint")}</p>
    </Box>
  );
}
