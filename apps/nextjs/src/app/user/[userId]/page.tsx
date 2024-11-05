import { EditProfileForm } from "~/app/_components/profile-edit";
import { HydrateClient } from "~/trpc/server";

export const runtime = "edge";

export default function HomePage() {
  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <EditProfileForm />
        </div>
      </main>
    </HydrateClient>
  );
}
