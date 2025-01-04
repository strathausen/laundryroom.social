/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use client";

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

import { api } from "~/trpc/react";
import { PledgeItem } from "./pledgeboard-item";

interface PledgeItemData {
  id: string;
  title: string;
  description: string | null;
  capacity: number;
  fulfillments: {
    quantity: number;
    user: { id: string; name: string | null; email: string };
  }[];
  isNew?: boolean;
}

interface PledgeboardProps {
  meetupId: string;
  isAdmin: boolean;
}

export default function PledgeBoardWidget({
  isAdmin,
  meetupId,
}: PledgeboardProps) {
  const getPledgeboardQuery = api.pledge.getPledgeBoard.useQuery({ meetupId });
  const reorderPledgesMutation = api.pledge.reorderPledges.useMutation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editMode, setEditMode] = useState(false);
  const upsertPedgeboardQuery = api.pledge.upsertPledgeBoard.useMutation();
  const session = useSession();
  const [pledgeItems, setPledgeItems] = useState<PledgeItemData[]>();
  const currentUserId = session.data?.user.id;

  useEffect(() => {
    if (getPledgeboardQuery.data) {
      setTitle(getPledgeboardQuery.data.title);
      setDescription(getPledgeboardQuery.data.description ?? "");
      setEditMode(!getPledgeboardQuery.data.title);
      setPledgeItems(getPledgeboardQuery.data.pledges);
    }
  }, [getPledgeboardQuery.data]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setPledgeItems((items) => {
        if (!items) return [];
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);
        if (getPledgeboardQuery.data?.id)
          reorderPledgesMutation.mutate({
            pledgeBoardId: getPledgeboardQuery.data.id,
            sorting: newItems.map((item) => item.id),
          });
        return newItems;
      });
    }
  };

  const handleDelete = (itemId: string) => {
    setPledgeItems((items) => items?.filter((item) => item.id !== itemId));
  };

  const handleEdit = async () => {
    await upsertPedgeboardQuery.mutateAsync({
      meetupId,
      title,
      description,
    });
    setEditMode(false);
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
                if (editMode) await handleEdit();
                setEditMode(!editMode);
              }}
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
                    sortOrder={i + 1}
                    pledgeBoardId={pledgeBoardId}
                    onDelete={() => handleDelete(item.id)}
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
              Add New Item
            </Button>
          </div>
        )}
      </div>
    </Box>
  );
}
