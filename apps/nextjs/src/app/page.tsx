import { HydrateClient } from "~/trpc/server";
import { AuthShowcase } from "./_components/auth-showcase";

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
