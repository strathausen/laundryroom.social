"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

import { usePathname } from "~/i18n/routing";

interface Props {
  message: string;
  children: React.ReactNode;
}

export function LoginCta(props: Props) {
  const session = useSession();
  // send the user back to where they were after signing in
  const pathname = usePathname();
  return session.data ? (
    <>{props.children}</>
  ) : (
    <Link
      href={`/api/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`}
      className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
    >
      {props.message}
    </Link>
  );
}
