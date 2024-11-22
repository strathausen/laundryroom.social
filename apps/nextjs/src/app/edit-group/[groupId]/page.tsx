import { GroupForm } from "~/app/_components/group/group-form";
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
      <main className="container h-screen max-w-screen-lg py-16">
        <div className="flex flex-col gap-4">
          <h2 className="pb-2 text-2xl uppercase">
            {isNew ? "Create Group" : "Edit Group"}
          </h2>
          {isNew && <p>create a new group to meet people</p>}
          <GroupForm groupId={params.groupId} isNew={isNew} />
        </div>
      </main>
    </HydrateClient>
  );
}
