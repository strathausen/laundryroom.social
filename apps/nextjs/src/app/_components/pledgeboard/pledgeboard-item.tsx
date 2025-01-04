"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon,
  ChevronDown,
  ChevronUp,
  Edit2,
  GripVertical,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";

import { AutoHeightTextarea } from "@laundryroom/ui/auto-height-textarea";
import { AutoWidthTextarea } from "@laundryroom/ui/auto-width-textarea";

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

interface PledgeItemProps {
  item: PledgeItemData;
  isAdmin: boolean;
  currentUserId: string;
  onPledge: (itemId: string, amount: number) => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

export function PledgeItem({
  item,
  isAdmin,
  currentUserId,
  onPledge,
  onDelete,
}: PledgeItemProps) {
  const [editMode, setEditMode] = useState(!!item.isNew);
  const [isExpanded, setIsExpanded] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [capacity, setCapacity] = useState(item.neededAmount);

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
      className="border border-black bg-gray-100"
    >
      <div className="flex gap-2 p-4">
        {isAdmin && (
          <div {...listeners} className="-ml-2 flex cursor-move items-center">
            <GripVertical size={20} />
          </div>
        )}
        <div className="flex flex-grow flex-col gap-2">
          {editMode ? (
            <input
              type="text"
              className="w-full border-b border-[#f0f] text-xl font-bold"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          ) : (
            <h3 className="whitespace-pre-wrap pb-[1px] text-xl font-bold">
              {item.title}
            </h3>
          )}
          {editMode ? (
            <AutoHeightTextarea
              className="border-b border-[#f0f] text-sm text-gray-600"
              onChange={setDescription}
              value={description}
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-gray-600">
              {description}
            </p>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`flex items-center whitespace-nowrap px-2 py-1 text-sm font-bold ${
              getPledgeStatus(item.neededAmount, item.pledgedAmount) === "under"
                ? "border-2 border-yellow-500 bg-yellow-200"
                : getPledgeStatus(item.neededAmount, item.pledgedAmount) ===
                    "over"
                  ? "border-2 border-green-500 bg-green-200"
                  : "border-2 border-blue-500 bg-blue-200"
            }`}
          >
            <span>{item.pledgedAmount}</span>
            <span className="ml-[2px]">/</span>
            <AutoWidthTextarea
              className={`${editMode ? "border-[#f0f] bg-white" : "border-transparent bg-transparent"} -mr-[4px] border-b pl-[2px] outline-none`}
              onChange={(v) => {
                setCapacity(v ? parseInt(v, 10) : 0);
              }}
              value={capacity.toString()}
              readonly={!editMode}
              onKeyUp={(key) => {
                switch (key) {
                  case "Enter":
                    setEditMode(false);
                    break;
                  case "ArrowUp":
                    setCapacity((prev) => prev + 1);
                    break;
                  case "ArrowDown":
                    setCapacity((prev) => Math.max(prev - 1, 1));
                    break;
                }
              }}
            />
          </div>
          {isAdmin && (
            <>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`${editMode ? "bg-green-600 hover:bg-green-700" : "bg-blue-500 hover:bg-blue-600"} p-1 text-white transition-colors duration-300`}
              >
                {editMode ? <CheckIcon size={20} /> : <Edit2 size={20} />}
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
        <div className="mt-4 space-y-2 p-4">
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
