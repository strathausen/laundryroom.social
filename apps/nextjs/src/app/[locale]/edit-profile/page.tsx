import { EditProfileForm } from "~/app/_components/profile-edit";
import { HydrateClient } from "~/trpc/server";

// export const runtime = "edge";

export default function EditProfilePage() {
  return (
    <HydrateClient>
      <main className="container flex min-h-screen flex-col gap-4 py-16">
        <h1 className="text-center text-3xl font-bold text-black">
          your profile
        </h1>
        <p className="text-center text-black">
          this is a place to tell the world about yourself
        </p>
        <div className="flex flex-col items-center justify-center gap-4">
          <EditProfileForm />
        </div>
      </main>
    </HydrateClient>
  );
}
