import type { User } from "next-auth";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { create } from "zustand";

import type { RouterInputs, RouterOutputs } from "@laundryroom/api";

import { api } from "~/trpc/react";

interface DiscussionStore {
  postedItems: Record<string, Discussion[]>;
  deletedItems: string[];
  upsert(groupId: string, item: DiscussionInput, user: User): void;
}

export const useDiscussionStore = create<DiscussionStore>()((set) => ({
  postedItems: {},
  deletedItems: [],
  upsert(groupId: string, item: DiscussionInput, user: User) {
    set((state) => {
      // if the item has an id, it's an update
      let tempId: string;
      const groupDiscussions = state.postedItems[groupId] ?? [];
      if (item.id) {
        return {
          ...state,
          postedItems: {
            ...state.postedItems,
            [groupId]: groupDiscussions.map((i) =>
              i.id === item.id ? { ...i, ...item } : i,
            ),
          },
        };
      } else {
        tempId = `temp-${Math.random().toString(36).substring(7)}`;
        return {
          ...state,
          postedItems: {
            [groupId]: [
              {
                ...item,
                id: tempId,
                createdAt: new Date().toISOString(),
                user: {
                  ...user,
                  id: user.id ?? "anonymous",
                  name: user.name ?? "anonymous",
                  image: user.image ?? null,
                },
                commentCount: 0,
              },
              ...groupDiscussions,
            ],
          },
        };
      }
    });
  },
}));

type Discussion =
  RouterOutputs["discussion"]["byGroupId"]["discussions"][number];

type DiscussionInput = RouterInputs["discussion"]["upsert"];

export function useDiscussions({ groupId }: { groupId: string }) {
  const session = useSession();
  const listQuery = api.discussion.byGroupId.useInfiniteQuery(
    { groupId },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  const store = useDiscussionStore();
  const [postedItems, setPostedItems] = useState<Discussion[]>([]);
  const [deletedItems, setDeletedItems] = useState<string[]>([]);
  const upsertMutation = api.discussion.upsert.useMutation();
  const deleteMutation = api.discussion.delete.useMutation();

  const upsert = async (item: DiscussionInput) => {
    // Temporarily add the new item to the list with a temporary ID
    if (!session.data?.user) return; // for typescript to be happy
    // if the item has an id, it's an update
    let tempId: string;
    store.upsert(groupId, item, session.data.user);
    // Call the mutation to actually create the item
    const newItem = await upsertMutation.mutateAsync(item);
    // Replace the temporary item ID with the actual item ID
    setPostedItems((prev) =>
      prev.map((item) => (item.id === tempId ? { ...item, ...newItem } : item)),
    );
  };

  const deleteItem = async (id: string) => {
    await deleteMutation.mutateAsync(id);
    setDeletedItems((prev) => [...prev, id]);
  };

  return {
    upsert,
    delete: deleteItem,
    fetchNextPage: listQuery.fetchNextPage,
    isDeleting: deleteMutation.isPending,
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
