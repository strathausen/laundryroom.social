/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
"use client";

import React, { useState } from "react";
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

import { Button } from "@laundryroom/ui/button";

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
  currentUserId: string;
}

export default function PledgeBoardWidget({
  isAdmin = true,
  currentUserId = "user1",
}: PledgeboardProps) {
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

  const handleEdit = (itemId: string) => {
    // Implement edit functionality here
    console.log(`Edit item with id: ${itemId}`);
  };

  return (
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
                onEdit={() => handleEdit(item.id)}
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
  );
}
