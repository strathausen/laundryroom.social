import Link from "next/link";

import { auth, signIn, signOut } from "@laundryroom/auth";
import { Button } from "@laundryroom/ui/button";

import { EditProfileForm } from "./profile-edit";

export async function AuthWidget({
  experimental = false,
}: {
  experimental?: boolean;
}) {
  const session = await auth();

  if (!session) {
    return (
      <form className="flex gap-4">
        {experimental && (
          <Button
            size="lg"
            formAction={async () => {
              "use server";
              await signIn("discord");
            }}
          >
            sign in with discord
          </Button>
        )}
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await signIn("email");
          }}
        >
          sign in with email
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 text-black">
      {session.user.name ? (
        <p className="text-center text-2xl">
          <span>
            you are logged in as {session.user.name || session.user.email}
          </span>
        </p>
      ) : (
        <div>
          <p>
            <strong>Welcome to LaundryRoom!</strong> To get started, please
            complete your profile.
          </p>
          <EditProfileForm />
        </div>
      )}
      {/* link to groups */}
      <div className="flex gap-4">
        <Link
          className="text-xl underline decoration-green-400 decoration-4 underline-offset-4"
          href="/groups"
        >
          go discover some awesome meetup groups
        </Link>{" "}
        <div className="text-4xl">🚀</div>
      </div>

      <form>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await signOut();
          }}
        >
          sign out
        </Button>
      </form>
    </div>
  );
}
