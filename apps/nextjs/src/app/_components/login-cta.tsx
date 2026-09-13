"use client";

import { authClient } from "~/auth-client";
import { Link, usePathname } from "~/i18n/routing";

interface Props {
  message: string;
  children: React.ReactNode;
}

export function LoginCta(props: Props) {
  const session = authClient.useSession();
  // send the user back to where they were after signing in
  const pathname = usePathname();
  return session.data ? (
    <>{props.children}</>
  ) : (
    <Link
      href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
      className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
    >
      {props.message}
    </Link>
  );
}
