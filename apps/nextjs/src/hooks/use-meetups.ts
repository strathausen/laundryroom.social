import { atom, useAtom } from "jotai";

import type { RouterInputs, RouterOutputs } from "@laundryroom/api";

import { api } from "~/trpc/react";

type Meetup = RouterOutputs["meetup"]["byGroupId"]["meetups"][number];
type MeetupInput = RouterInputs["meetup"]["upsert"];

const postedItemsAtom = atom<Record<string, Meetup[]>>({});

export function useMeetups({ groupId }: { groupId: string }) {
  const listQuery = api.meetup.byGroupId.useInfiniteQuery(
    { groupId, limit: 3 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getPreviousPageParam: (lastPage) => lastPage.prevCursor,
    },
  );
  const upsertMutation = api.meetup.upsert.useMutation();
  const [postedItems, setPostedItems] = useAtom(postedItemsAtom);
  async function upsert(item: MeetupInput) {
    // Temporarily add the new item to the list with a temporary ID
    const tempId = `temp-${Math.random().toString(36).substring(7)}`;
    const placeholderItem: Meetup = {
      ...item,
      id: item.id ?? tempId,
      description: item.description ?? "",
      location: item.location ?? "",
      duration: item.duration ?? 0,
      attendance: undefined,
      attendeesCount: 0,
      updatedAt: new Date(),
      createdAt: new Date().toDateString(),
      isOngoing: false,
      isOver: false,
    };
    setPostedItems((prev) => {
      const groupMeetups = prev[groupId] ?? [];
      if (item.id) {
        return {
          ...prev,
          [groupId]: groupMeetups.map((i) =>
            i.id === item.id ? { ...i, ...placeholderItem } : i,
          ),
        };
      } else {
        return {
          ...prev,
          [groupId]: [placeholderItem, ...groupMeetups],
        };
      }
    });
    // Call the mutation to actually create the item
    const newItem = await upsertMutation.mutateAsync(item);
    // Replace the temporary item ID with the actual item ID
    setPostedItems((prev) => ({
      ...prev,
      [groupId]: (prev[groupId] ?? []).map((i) =>
        i.id === tempId ? { ...i, id: newItem.id } : i,
      ),
    }));
  }
  return {
    upsert,
    items: (postedItems[groupId] ?? [])
      .concat(listQuery.data?.pages.flatMap((page) => page.meetups) ?? [])
      .sort(
        (a, b) =>
          new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
      ),
    hasNextPage: listQuery.hasNextPage,
    hasPreviousPage: listQuery.hasPreviousPage,
    fetchNextPage: () => listQuery.fetchNextPage(),
    fetchPreviousPage: () => listQuery.fetchPreviousPage(),
    isLoading: listQuery.isLoading,
  };
}
