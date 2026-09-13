"use client";

import type { DragEndEvent } from "@dnd-kit/core";
import React, { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CheckIcon, PencilIcon } from "lucide-react";
import { useSession } from "next-auth/react";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";
import type { PledgeItemData, SavedPledgeItem } from "./pledgeboard-item";
import { PledgeItem } from "./pledgeboard-item";

interface PledgeboardProps {
  meetupId: string;
  isAdmin: boolean;
  disabled?: boolean;
}

export default function PledgeBoardWidget({
  isAdmin,
  meetupId,
  disabled,
}: PledgeboardProps) {
  const utils = api.useUtils();
  const getPledgeboardQuery = api.pledge.getPledgeBoard.useQuery({ meetupId });
  // same query as the meetup page (deduped by react query). its attendees are
  // server-filtered to "going" rsvps and RsvpSelect invalidates it after every
  // rsvp change, so this stays in sync with the viewer's current rsvp.
  const meetupQuery = api.meetup.byId.useQuery({ id: meetupId });
  const reorderPledgesMutation = api.pledge.reorderPledges.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editMode, setEditMode] = useState(false);
  const upsertPedgeboardQuery = api.pledge.upsertPledgeBoard.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const session = useSession();
  const [pledgeItems, setPledgeItems] = useState<PledgeItemData[]>();
  const currentUserId = session.data?.user.id;
  const canPledge =
    meetupQuery.data?.attendees.some((attendee) => attendee.isCurrentUser) ??
    false;

  useEffect(() => {
    if (getPledgeboardQuery.data) {
      setTitle(getPledgeboardQuery.data.title);
      setDescription(getPledgeboardQuery.data.description ?? "");
      setEditMode(!getPledgeboardQuery.data.title);
      setPledgeItems(getPledgeboardQuery.data.pledges);
    }
    if (
      !getPledgeboardQuery.data?.title &&
      isAdmin &&
      getPledgeboardQuery.isFetched
    ) {
      setEditMode(true);
    }
  }, [getPledgeboardQuery.data, getPledgeboardQuery.isFetched, isAdmin]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPledgeItems((items) => {
        if (!items) return [];
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        if (getPledgeboardQuery.data?.id)
          reorderPledgesMutation.mutate({
            pledgeBoardId: getPledgeboardQuery.data.id,
            // unsaved items only exist locally and have no server id yet
            sorting: newItems
              .filter((item) => !item.isNew)
              .map((item) => item.id),
          });
        return newItems;
      });
    }
  };

  const handleDelete = (itemId: string) => {
    setPledgeItems((items) => items?.filter((item) => item.id !== itemId));
  };

  // keep the list in sync with what the item saved, so a freshly created item
  // gets its real id (used as sortable id) instead of the temporary local one
  const handleSaved = (localId: string, saved: SavedPledgeItem) => {
    setPledgeItems((items) =>
      items?.map((item) =>
        item.id === localId ? { ...item, ...saved, isNew: false } : item,
      ),
    );
  };

  const handleEdit = async () => {
    try {
      const { id } = await upsertPedgeboardQuery.mutateAsync({
        meetupId,
        title,
        description,
      });
      setEditMode(false);
      // the item list and the "add new item" button are gated on the board id
      // from the query cache, so a freshly created board needs a refetch right
      // away. plain title edits skip it: a refetch would reset the local item
      // list and drop items that were added but not saved yet.
      if (getPledgeboardQuery.data?.id !== id) {
        await utils.pledge.getPledgeBoard.invalidate({ meetupId });
      }
    } catch {
      // the mutation's onError already showed a toast; stay in edit mode
    }
  };

  // for non admin users, don't show the pledgeboard if it doesn't exist
  if (
    (!isAdmin && !getPledgeboardQuery.data?.pledges.length) ||
    !currentUserId
  ) {
    return null;
  }

  const pledgeBoardId = getPledgeboardQuery.data?.id;

  return (
    <Box className="flex flex-col gap-4">
      <div className="relative">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleEdit();
          }}
        >
          <div className="flex flex-col gap-4">
            <div className="-ml-[1px] -mt-[1px] pr-6">
              {editMode && isAdmin ? (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-[#f0f] font-extrabold underline decoration-green-400 decoration-4 disabled:opacity-50"
                  placeholder="pledgeboard: who brings what? tasks?"
                  disabled={upsertPedgeboardQuery.isPending}
                />
              ) : (
                <h2 className="border border-transparent font-extrabold underline decoration-green-400 decoration-4">
                  {title}
                </h2>
              )}
            </div>
            <div className="-ml-[1px] -mt-[1px]">
              {editMode && isAdmin ? (
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`w-full border border-[#f0f] disabled:opacity-50`}
                  placeholder="description"
                  disabled={upsertPedgeboardQuery.isPending}
                />
              ) : (
                <p className="border border-transparent">{description}</p>
              )}
            </div>
          </div>
        </form>
        {isAdmin && (
          <div
            className={`absolute right-0 top-0 ${editMode ? "" : "opacity-50"} transition-opacity hover:opacity-100`}
          >
            <button
              onClick={async () => {
                if (editMode) {
                  // leaves edit mode only when the save succeeded
                  await handleEdit();
                } else {
                  setEditMode(true);
                }
              }}
              disabled={upsertPedgeboardQuery.isPending}
            >
              {editMode ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <PencilIcon className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>
      <div className="font-mono">
        {pledgeBoardId && pledgeItems && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pledgeItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-4">
                {pledgeItems.map((item, i) => (
                  <PledgeItem
                    key={item.id}
                    item={item}
                    isAdmin={isAdmin}
                    canPledge={canPledge}
                    sortOrder={i + 1}
                    pledgeBoardId={pledgeBoardId}
                    onDelete={() => handleDelete(item.id)}
                    onSaved={(saved) => handleSaved(item.id, saved)}
                    disabled={disabled}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {isAdmin && getPledgeboardQuery.data?.id && (
          <div className="mt-4 flex flex-col">
            <Button
              onClick={() =>
                setPledgeItems((items) => [
                  ...(items ?? []),
                  {
                    id: Math.random().toString(36).slice(2, 11),
                    title: "",
                    description: "",
                    capacity: 1,
                    fulfillments: [],
                    isNew: true,
                  },
                ])
              }
              variant={"ghost"}
            >
              add new item
            </Button>
          </div>
        )}
      </div>
    </Box>
  );
}
