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

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";

import { api } from "~/trpc/react";
import { PledgeItem } from "./pledgeboard-item";

interface Pledger {
  id: string;
  name: string;
  amount: number;
}

interface PledgeItemData {
  id: string;
  title: string;
  description: string;
  neededAmount: number;
  pledgedAmount: number;
  pledgers: Pledger[];
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
  const _updatePledgeQuery = api.pledge.updatePledge.useMutation();
  const getPledgeboardQuery = api.pledge.getPledgeBoard.useQuery({ meetupId });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editMode, setEditMode] = useState(false);
  const upsertPedgeboardQuery = api.pledge.upsertPledgeBoard.useMutation();
  const currentUserId = "user1";
  const [pledgeItems, setPledgeItems] = useState<PledgeItemData[]>([
    {
      id: "1",
      title: "Bring Snacks",
      description: "We need various snacks for the meetup",
      neededAmount: 5,
      pledgedAmount: 3,
      pledgers: [
        { id: "user1", name: "Alice", amount: 2 },
        { id: "user2", name: "Bob", amount: 1 },
      ],
    },
    {
      id: "2",
      title: "Setup Chairs",
      description: "Help arrange seating before the event",
      neededAmount: 10,
      pledgedAmount: 12,
      pledgers: [
        { id: "user3", name: "Charlie", amount: 8 },
        { id: "user4", name: "David", amount: 4 },
      ],
    },
    {
      id: "3",
      title: "Bring Projector",
      description: "We need a projector for presentations",
      neededAmount: 1,
      pledgedAmount: 1,
      pledgers: [{ id: "user5", name: "Eve", amount: 1 }],
    },
  ]);

  useEffect(() => {
    if (getPledgeboardQuery.data) {
      console.log(getPledgeboardQuery.data);
      setTitle(getPledgeboardQuery.data.title);
      setDescription(getPledgeboardQuery.data.description ?? "");
      setEditMode(!getPledgeboardQuery.data.title);
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
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handlePledge = (itemId: string, amount: number) => {
    setPledgeItems((items) =>
      items.map((item) => {
        if (item.id === itemId) {
          const existingPledgerIndex = item.pledgers.findIndex(
            (p) => p.id === currentUserId,
          );
          let updatedPledgers;

          if (existingPledgerIndex !== -1) {
            updatedPledgers = [...item.pledgers];
            if (!updatedPledgers[existingPledgerIndex]) {
              updatedPledgers[existingPledgerIndex] = {
                id: currentUserId,
                name: "You",
                amount: 0,
              };
            }
            updatedPledgers[existingPledgerIndex].amount = Math.max(
              0,
              updatedPledgers[existingPledgerIndex]?.amount + amount,
            );
            if (updatedPledgers[existingPledgerIndex].amount <= 0) {
              updatedPledgers.splice(existingPledgerIndex, 1);
            }
          } else if (amount > 0) {
            updatedPledgers = [
              ...item.pledgers,
              { id: currentUserId, name: "You", amount },
            ];
          } else {
            updatedPledgers = item.pledgers;
          }

          return {
            ...item,
            pledgedAmount: Math.max(0, item.pledgedAmount + amount),
            pledgers: updatedPledgers,
          };
        }
        return item;
      }),
    );
  };

  const handleDelete = (itemId: string) => {
    setPledgeItems((items) => items.filter((item) => item.id !== itemId));
  };

  const handleItemEdit = (itemId: string) => {
    // Implement edit functionality here
    console.log(`Edit item with id: ${itemId}`);
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
  if (!isAdmin && !getPledgeboardQuery.data) {
    return null;
  }

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
              {pledgeItems.map((item) => (
                <PledgeItem
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                  onPledge={handlePledge}
                  onDelete={() => handleDelete(item.id)}
                  onEdit={() => handleItemEdit(item.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {/* add new */}
        {isAdmin && (
          <div className="mt-4 flex flex-col">
            <Button
              onClick={() =>
                setPledgeItems((items) => [
                  ...items,
                  {
                    id: Math.random().toString(36).slice(2, 11),
                    title: "New Item",
                    description: "Description",
                    neededAmount: 1,
                    pledgedAmount: 0,
                    pledgers: [],
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
