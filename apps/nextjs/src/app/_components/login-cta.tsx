import Link from "next/link";
import { useSession } from "next-auth/react";

type Props = {
  message: string;
  children: React.ReactNode;
};

export function LoginCta(props: Props) {
  const session = useSession();
  return session.data ? (
    <>{props.children}</>
  ) : (
    <Link
      href="/api/auth/signin"
      className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
    >
      {props.message}
    </Link>
  );
}
