/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  Edit2,
  GripVertical,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";

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
}

interface PledgeItemProps {
  item: PledgeItemData;
  isAdmin: boolean;
  currentUserId: string;
  onPledge: (itemId: string, amount: number) => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

function PledgeItem({
  item,
  isAdmin,
  currentUserId,
  onPledge,
  onDelete,
  onEdit,
}: PledgeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const toggleExpand = () => setIsExpanded(!isExpanded);

  const getPledgeStatus = (needed: number, pledged: number) => {
    if (pledged < needed) return "under";
    if (pledged > needed) return "over";
    return "just-right";
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="border border-black bg-gray-100 p-4"
    >
      <div className="flex items-center justify-between">
        {isAdmin && (
          <div {...listeners} className="mr-2 -ml-2 cursor-move h-full bg-green-50">
            <GripVertical size={20} />
          </div>
        )}
        <div className="flex-grow">
          <h3 className="text-xl font-bold">{item.title}</h3>
          <p className="text-sm text-gray-600">{item.description}</p>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`whitespace-nowrap px-2 py-1 text-sm font-bold ${
              getPledgeStatus(item.neededAmount, item.pledgedAmount) === "under"
                ? "border-2 border-yellow-500 bg-yellow-200"
                : getPledgeStatus(item.neededAmount, item.pledgedAmount) ===
                    "over"
                  ? "border-2 border-green-500 bg-green-200"
                  : "border-2 border-blue-500 bg-blue-200"
            }`}
          >
            {item.pledgedAmount} / {item.neededAmount}
          </div>
          {isAdmin && (
            <>
              <button
                onClick={onEdit}
                className="bg-blue-500 p-1 text-white transition-colors duration-300 hover:bg-blue-600"
              >
                <Edit2 size={20} />
              </button>
              <button
                onClick={onDelete}
                className="bg-red-500 p-1 text-white transition-colors duration-300 hover:bg-red-600"
              >
                <Trash2 size={20} />
              </button>
            </>
          )}
          <button
            onClick={toggleExpand}
            className="bg-gray-300 p-1 transition-colors duration-300 hover:bg-gray-400"
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>
      </div>
      {isExpanded && (
        <div className="mt-4 space-y-2">
          <h4 className="font-bold">Pledgers:</h4>
          <ul className="list-inside list-disc">
            {item.pledgers.map((pledger) => (
              <li
                key={pledger.id}
                className={pledger.id === currentUserId ? "font-bold" : ""}
              >
                {pledger.name}: {pledger.amount}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center space-x-2">
            <button
              onClick={() => onPledge(item.id, 1)}
              className="border-2 border-black bg-black p-2 text-white transition-colors duration-300 hover:bg-white hover:text-black"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => onPledge(item.id, -1)}
              className="border-2 border-black bg-black p-2 text-white transition-colors duration-300 hover:bg-white hover:text-black"
            >
              <Minus size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
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
    </div>
  );
}
