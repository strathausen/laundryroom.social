import { atom, useAtom } from "jotai";
import { useSession } from "next-auth/react";

import type { RouterInputs, RouterOutputs } from "@laundryroom/api";

import { api } from "~/trpc/react";

const postedItemsAtom = atom<Record<string, Discussion[]>>({});
const deletedItemsAtom = atom<string[]>([]);

type Discussion =
  RouterOutputs["discussion"]["byGroupId"]["discussions"][number];

type DiscussionInput = RouterInputs["discussion"]["upsert"];

export function useDiscussions({ groupId }: { groupId: string }) {
  const session = useSession();
  const listQuery = api.discussion.byGroupId.useInfiniteQuery(
    { groupId },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const [postedItems, setPostedItems] = useAtom(postedItemsAtom);
  const [deletedItems, setDeletedItems] = useAtom(deletedItemsAtom);
  const upsertMutation = api.discussion.upsert.useMutation();
  const deleteMutation = api.discussion.delete.useMutation();

  const upsert = async (item: DiscussionInput) => {
    // Temporarily add the new item to the list with a temporary ID
    if (!session.data?.user) return; // for typescript to be happy
    // if the item has an id, it's an update
    let tempId: string | undefined;
    setPostedItems((prev) => {
      const groupDiscussions = prev[groupId] ?? [];
      if (item.id) {
        return {
          ...prev,
          [groupId]: groupDiscussions.map((i) =>
            i.id === item.id ? { ...i, ...item } : i,
          ),
        };
      } else {
        tempId = `temp-${Math.random().toString(36).substring(7)}`;
        return {
          ...prev,
          [groupId]: [
            {
              ...item,
              id: tempId,
              createdAt: new Date().toISOString(),
              user: { name: null, image: null, ...session.data.user },
              commentCount: 0,
            },
            ...groupDiscussions,
          ],
        };
      }
    });
    // Call the mutation to actually create the item
    const newItem = await upsertMutation.mutateAsync(item);
    // Replace the temporary item ID with the actual item ID
    if (!tempId) return;
    setPostedItems((prev) => ({
      ...prev,
      [groupId]:
        prev[groupId]?.map((i) =>
          i.id === tempId
            ? {
                ...i,
                ...newItem,
                user: { name: null, image: null, ...session.data.user },
              }
            : i,
        ) ?? [],
    }));
  };

  const deleteItem = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setDeletedItems((prev) => [...prev, id]);
  };

  return {
    upsert,
    delete: deleteItem,
    fetchNextPage: listQuery.fetchNextPage,
    deletingId: deleteMutation.variables,
    items: (postedItems[groupId] ?? [])
      .concat(listQuery.data?.pages.flatMap((page) => page.discussions) ?? [])
      .filter((item) => !deletedItems.includes(item.id))
      .map((item) => ({
        ...item,
        isTemporary: item.id.startsWith("temp-"),
        isDeleting: deleteMutation.variables === item.id,
      })),
    hasNextPage: listQuery.hasNextPage,
  };
}
