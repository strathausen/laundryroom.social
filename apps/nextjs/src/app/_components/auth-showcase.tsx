import { auth, signIn, signOut } from "@laundryroom/auth";
import { Button } from "@laundryroom/ui/button";

export async function AuthShowcase() {
  const session = await auth();

  if (!session) {
    return (
      <form className="flex gap-4">
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await signIn("discord");
          }}
        >
          Sign in with Discord
        </Button>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await signIn("email");
          }}
        >
          Sign in with Email
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <p className="text-center text-2xl">
        <span>Logged in as {session.user.name}</span>
      </p>

      <form>
        <Button
          size="lg"
          formAction={async () => {
            "use server";
            await signOut();
          }}
        >
          Sign out
        </Button>
      </form>
    </div>
  );
}
