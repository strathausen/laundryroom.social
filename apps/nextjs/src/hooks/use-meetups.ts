import { atom, useAtom } from "jotai";

import type { RouterInputs, RouterOutputs } from "@laundryroom/api";

import { api } from "~/trpc/react";

type Meetup = RouterOutputs["meetup"]["byGroupId"]["meetups"][number];
type MeetupInput = RouterInputs["meetup"]["upsert"];

const postedItemsAtom = atom<Record<string, Meetup[]>>({});

export function useMeetups({ groupId }: { groupId: string }) {
  // the first page holds all upcoming meetups (up to the api's cap of 50),
  // every further page loads past meetups
  const listQuery = api.meetup.byGroupId.useInfiniteQuery(
    { groupId, limit: 50 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
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
      status: "active",
      attendeeLimit: item.attendeeLimit ?? null,
      isFull: false,
      organizerId: "",
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
  const allItems = (postedItems[groupId] ?? []).concat(
    listQuery.data?.pages.flatMap((page) => page.meetups) ?? [],
  );
  const startOf = (meetup: Meetup) => new Date(meetup.startTime).getTime();
  // upcoming meetups first, nearest first; then past meetups, most recent first
  const upcoming = allItems
    .filter((meetup) => !meetup.isOver)
    .sort((a, b) => startOf(a) - startOf(b));
  const past = allItems
    .filter((meetup) => meetup.isOver)
    .sort((a, b) => startOf(b) - startOf(a));
  return {
    upsert,
    items: upcoming.concat(past),
    hasNextPage: listQuery.hasNextPage,
    fetchNextPage: () => listQuery.fetchNextPage(),
    isLoading: listQuery.isLoading,
  };
}
