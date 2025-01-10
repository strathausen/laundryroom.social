import Image from "next/image";

import { Link } from "~/i18n/routing";
import { api, HydrateClient } from "~/trpc/server";

// export const runtime = "edge";

export default async function UserPage({
  params,
}: {
  params: { userId: string };
}) {
  const session = await api.auth.getSession();
  const user = await api.profile.getPublicProfile({ userId: params.userId });
  return (
    <HydrateClient>
      <main className="container flex h-screen flex-col items-center gap-4 py-16">
        <h1 className="text-center text-3xl font-bold text-black">
          {user?.name}
        </h1>
        {user?.image && (
          <Image
            src={user.image}
            alt={user.name ?? "user profile image"}
            width={200}
            height={200}
            className="border-2 border-black"
          />
        )}
        <p className="text-center text-black">{user?.bio}</p>
        {session?.user.id === params.userId && (
          <div className="text-center text-gray-500">
            <h2>you are viewing your own profile</h2>
            <Link
              className="underline decoration-green-400 decoration-4 underline-offset-4"
              href="/edit-profile"
            >
              edit your profile
            </Link>
          </div>
        )}
      </main>
    </HydrateClient>
  );
}
