import { useState } from "react";
import { useSession } from "next-auth/react";

import type { RouterInputs, RouterOutputs } from "@laundryroom/api";

import { api } from "~/trpc/react";

type Discussion =
  RouterOutputs["discussion"]["byGroupId"]["discussions"][number];

type DiscussionInput = RouterInputs["discussion"]["upsert"];

export function useDiscussions({ groupId }: { groupId: string }) {
  const session = useSession();
  const listQuery = api.discussion.byGroupId.useInfiniteQuery(
    { groupId },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const [postedItems, setPostedItems] = useState<Discussion[]>([]);
  const [deletedItems, setDeletedItems] = useState<string[]>([]);
  const upsertMutation = api.discussion.upsert.useMutation();
  const deleteMutation = api.discussion.delete.useMutation();

  const upsert = async (item: DiscussionInput) => {
    // Temporarily add the new item to the list with a temporary ID
    const temId = "temp-" + Math.random().toString(36).substring(7);
    if (!session.data?.user) return; // for typescript to be happy
    setPostedItems((prev) => [
      {
        ...item,
        id: temId,
        createdAt: new Date().toISOString(),
        user: {
          ...session.data.user,
          name: session.data.user.name ?? "anonymous",
          image: session.data.user.image ?? null,
        },
        commentCount: 0,
      },
      ...prev,
    ]);
    // Call the mutation to actually create the item
    const newItem = await upsertMutation.mutateAsync(item);
    // Replace the temporary item ID with the actual item ID
    setPostedItems((prev) =>
      prev.map((item) => (item.id === temId ? { ...item, ...newItem } : item)),
    );
  };

  const deleteItem = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setDeletedItems((prev) => [...prev, id]);
  };

  return {
    upsert,
    delete: deleteItem,
    refetch: listQuery.refetch,
    fetchNextPage: listQuery.fetchNextPage,
    items: postedItems
      .concat(listQuery.data?.pages.flatMap((page) => page.discussions) ?? [])
      .map((item) => ({
        ...item,
        isTemporary: item.id.startsWith("temp-"),
        isDeleting: deleteMutation.variables === item.id,
      }))
      .filter((item) => !deletedItems.includes(item.id)),
    hasNextPage: listQuery.hasNextPage,
  };
}
