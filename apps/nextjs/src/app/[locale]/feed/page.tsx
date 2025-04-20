import { api } from "~/trpc/server";

export default async function HomePage() {
  await api.group.search({});
  return (
    <main className="container min-h-screen max-w-screen-lg py-16 text-black">
      <div className="flex flex-col gap-4">
        <h1 className="pb-2 text-3xl uppercase">feed</h1>
        <p>here you will find your feed</p>
      </div>
    </main>
  );
}
