import { AuthShowcase } from "~/app/_components/auth-showcase";
import { HydrateClient } from "~/trpc/server";

export const runtime = "edge";

export default function HomePage() {
  // You can await this here if you don't want to show Suspense fallback below

  return (
    <HydrateClient>
      <main className="container h-screen py-16">
        <div className="flex flex-col items-center justify-center gap-4">
          <AuthShowcase />
        </div>
      </main>
    </HydrateClient>
  );
}
