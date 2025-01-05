import { SessionProvider } from "next-auth/react";

import { AskForName } from "~/app/_components/ask-for-name";
import { GroupList } from "~/app/_components/group/group-list";
import { api } from "~/trpc/server";

export default async function GroupsPage() {
  await api.group.search({});
  const session = await api.auth.getSession();
  return (
    <main className="container min-h-screen max-w-screen-lg py-16 text-black">
      <SessionProvider>
        <div className="flex flex-col gap-4">
          {!session?.user.name && <AskForName />}
          <h1 className="pb-2 text-3xl uppercase">Groups</h1>
          <p>find your meetup group!</p>
          <GroupList />
        </div>
      </SessionProvider>
    </main>
  );
}
