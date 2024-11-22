import { HydrateClient } from "~/trpc/server";
import { AuthWidget } from "./_components/auth-widget";

// export const runtime = "edge";

export default function HomePage() {
  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <AuthWidget />
        </div>
      </main>
    </HydrateClient>
  );
}
