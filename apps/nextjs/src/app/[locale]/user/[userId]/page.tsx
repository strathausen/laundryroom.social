import { EditProfileForm } from "~/app/_components/profile-edit";
import { DeleteProfile } from "~/app/_components/profile/delete-profile";
import { HydrateClient } from "~/trpc/server";

// export const runtime = "edge";

export default function HomePage() {
  return (
    <HydrateClient>
      <main className="container flex h-screen flex-col gap-4 py-16">
        <h1 className="text-center text-4xl font-bold text-black">
          your profile
        </h1>
        <p className="text-center text-lg text-gray-600">
          this is a place to tell the world about yourself
        </p>
        <div className="flex flex-col items-center justify-center gap-4">
          <EditProfileForm />
        </div>
        <div>
          <DeleteProfile />
        </div>
      </main>
    </HydrateClient>
  );
}
