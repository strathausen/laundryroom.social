import { SessionProvider } from "next-auth/react";

import { api } from "~/trpc/server";
import { GroupList } from "../_components/groups";

export default async function GroupsPage() {
  await api.group.search({});
  return (
    <main className="container min-h-screen max-w-screen-lg py-16 text-black">
      <SessionProvider>
        <div className="flex flex-col gap-4">
          <h1 className="pb-2 text-3xl uppercase">Groups</h1>
          <p>find a group to join</p>
          <GroupList />
        </div>
      </SessionProvider>
    </main>
  );
}
