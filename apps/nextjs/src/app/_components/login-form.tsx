"use client";

import { useState } from "react";
import { FaGoogle } from "react-icons/fa6";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { authClient } from "~/auth-client";

interface Props {
  /** same-origin relative path to land on after signing in, already validated */
  callbackUrl: string;
  /** message for a failed previous attempt (from ?error=), shown above the form */
  error?: string;
}

type Status = "idle" | "sending" | "sent";

function describeApiError(error: { status: number; message?: string }) {
  if (error.status === 429) return "too many attempts, try again later";
  return (
    error.message?.toLowerCase() ?? "something went wrong, please try again"
  );
}

export function LoginForm({ callbackUrl, error }: Props) {
  const [email, setEmail] = useState("");
  // honeypot: people never see this field, bots fill in everything they find.
  // this only stops bots that drive the form; anything posting straight to
  // /api/auth/sign-in/magic-link skips it, and there the rate limit in
  // packages/auth (3 requests per 5 minutes per ip) is the real control
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [googlePending, setGooglePending] = useState(false);
  const [message, setMessage] = useState(error);
  // failed magic links and oauth callbacks come back to this page with ?error=
  const errorCallbackURL = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;

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
        <h2 className="text-xl font-bold">check your inbox</h2>
        <p>
          we sent a sign-in link to <strong>{email}</strong>. open it and press
          the button on the page it takes you to.
        </p>
        <p className="text-sm text-gray-500">
          nothing there? check your spam folder, or try again with a different
          address. the link expires after a short while.
        </p>
        <Button
          type="button"
          variant="plattenbau"
          onClick={() => setStatus("idle")}
        >
          use a different email
        </Button>
      </Box>
    );
  }

  return (
    <Box className="relative flex w-full max-w-md flex-col gap-6">
      {message && (
        <p
          role="alert"
          className="border-2 border-red-500 bg-red-50 p-3 text-red-700"
        >
          {message}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        className="flex items-center gap-2"
        onClick={signInWithGoogle}
        disabled={googlePending}
      >
        <FaGoogle /> continue with google
      </Button>
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <hr className="flex-1 border-black" />
        or
        <hr className="flex-1 border-black" />
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await requestMagicLink();
        }}
      >
        <label className="flex flex-col gap-1">
          <span>email</span>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
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
          disabled={status === "sending" || !email}
        >
          {status === "sending" ? "sending…" : "email me a sign-in link"}
        </Button>
      </form>
      <p className="text-sm text-gray-500">
        no password needed. we email you a link, and you press one button to
        finish signing in.
      </p>
    </Box>
  );
}
