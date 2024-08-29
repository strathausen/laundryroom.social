import { UpsertGroupForm } from "~/app/_components/groups";
import { api, HydrateClient } from "~/trpc/server";

interface PageProps {
  params: {
    groupId: string;
  };
}

export default async function EditGroupPage({ params }: PageProps) {
  const isNew = params.groupId === "new";
  // if group id is not "new" then fetch the group
  if (!isNew) {
    await api.group.byId.prefetch({ id: params.groupId });
  }
  return (
    <HydrateClient>
      <main className="container h-screen max-w-screen-lg py-16 text-foreground">
        <div className="flex flex-col gap-4">
          <h1 className="pb-2 text-5xl font-bold underline decoration-fancyorange decoration-4">
            {isNew ? "Create Group" : "Edit Group"}
          </h1>
          {isNew && <p>create a new group to meet people</p>}
          <UpsertGroupForm groupId={params.groupId} isNew={isNew} />
        </div>
      </main>
    </HydrateClient>
  );
}
