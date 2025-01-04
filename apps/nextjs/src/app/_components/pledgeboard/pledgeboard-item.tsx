/* eslint-disable @typescript-eslint/no-non-null-assertion */
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
import { useSession } from "next-auth/react";

import { AutoHeightTextarea } from "@laundryroom/ui/auto-height-textarea";
import { AutoWidthTextarea } from "@laundryroom/ui/auto-width-textarea";

import { api } from "~/trpc/react";

// TODO use router outputs type instead
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

interface PledgeItemProps {
  item: PledgeItemData;
  isAdmin: boolean;
  pledgeBoardId: string;
  sortOrder: number;
  onDelete?: () => void;
}

export function PledgeItem({
  item,
  isAdmin,
  pledgeBoardId,
  sortOrder,
  onDelete,
}: PledgeItemProps) {
  const upsertPledgeMutation = api.pledge.upsertPledge.useMutation();
  const deletePledgeMutation = api.pledge.deletePledge.useMutation();
  const fulfillmentMutation = api.pledge.setFulfillment.useMutation();
  const [editMode, setEditMode] = useState(!!item.isNew);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNew, setIsNew] = useState(item.isNew);
  const [id, setId] = useState(item.id);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [capacity, setCapacity] = useState(item.capacity);
  const [fulfillments, setFulfillments] = useState(item.fulfillments);
  const session = useSession();
  const currentUserId = session.data?.user.id;

  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

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

  const handleEdit = async () => {
    const res = await upsertPledgeMutation.mutateAsync({
      id: isNew ? undefined : id,
      title,
      description,
      capacity,
      pledgeBoardId,
      sortOrder,
    });
    if (isNew && res) {
      setId(res.id);
      setIsNew(false);
    }
    setEditMode(false);
  };

  const handleDelete = async () => {
    if (isNew) {
      onDelete?.();
    } else {
      await deletePledgeMutation.mutateAsync(id);
      onDelete?.();
    }
  };

  const handlePledge = async (quantity: number) => {
    const myFulfillment = fulfillments.find(
      (fulfillment) => fulfillment.user.id === currentUserId,
    );
    if (myFulfillment) {
      quantity += myFulfillment.quantity;
      quantity = Math.max(quantity, 0);
    } else if (quantity < 0) {
      return;
    }
    setFulfillments((prev) => {
      const newFulfillments = prev.map((fulfillment) => {
        if (fulfillment.user.id === currentUserId) {
          return { ...fulfillment, quantity };
        }
        return fulfillment;
      });
      const fulfillmentExists = newFulfillments.some(
        (fulfillment) => fulfillment.user.id === currentUserId,
      );
      if (!fulfillmentExists) {
        newFulfillments.push({
          quantity,
          user: {
            id: currentUserId!,
            name: session.data!.user.name!,
            email: session.data!.user.email!,
          },
        });
      }
      return newFulfillments;
    });
    await fulfillmentMutation.mutateAsync({
      pledgeId: id,
      quantity,
    });
  };

  const pledgedAmount = fulfillments.reduce(
    (acc, fulfillment) => acc + fulfillment.quantity,
    0,
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`border border-black bg-gray-100 ${deletePledgeMutation.isPending ? "opacity-50" : ""}`}
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
              placeholder="what do you need?"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
            />
          ) : (
            <h3 className="whitespace-pre-wrap pb-[1px] text-xl font-bold">
              {title}
            </h3>
          )}
          {editMode ? (
            <AutoHeightTextarea
              className="border-b border-[#f0f] text-sm text-gray-600"
              onChange={setDescription}
              placeholder="description"
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
              getPledgeStatus(capacity, pledgedAmount) === "under"
                ? "border-2 border-yellow-500 bg-yellow-200"
                : getPledgeStatus(capacity, pledgedAmount) === "over"
                  ? "border-2 border-green-500 bg-green-200"
                  : "border-2 border-blue-500 bg-blue-200"
            }`}
          >
            <span>{pledgedAmount}</span>
            <span className="ml-[2px]">/</span>
            <AutoWidthTextarea
              className={`${editMode ? "border-[#f0f] bg-white" : "border-transparent bg-transparent"} -mr-[4px] border-b pl-[2px] outline-none`}
              onChange={(v) => {
                setCapacity(v ? parseInt(v, 10) : 0);
              }}
              value={capacity.toString()}
              readonly={!editMode}
              onKeyUp={async (key) => {
                switch (key) {
                  case "Enter":
                    await handleEdit();
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
                onClick={async () => {
                  if (editMode) await handleEdit();
                  setEditMode(!editMode);
                }}
                className={`${editMode ? "bg-green-600 hover:bg-green-700" : "bg-blue-500 hover:bg-blue-600"} p-1 text-white transition-colors duration-300`}
              >
                {editMode ? <CheckIcon size={20} /> : <Edit2 size={20} />}
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-500 p-1 text-white transition-colors duration-300 hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="space-y-2 p-4">
          <h4 className="font-bold">Pledgers:</h4>
          <ul className="list-inside list-disc">
            {fulfillments.map((pledger) => (
              <li
                key={pledger.user.id}
                className={pledger.user.id === currentUserId ? "font-bold" : ""}
              >
                {pledger.user.name}: {pledger.quantity}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center space-x-2">
            <button
              onClick={() => handlePledge(1)}
              className="border-2 border-black bg-black p-2 text-white transition-colors duration-300 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isNew}
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => handlePledge(-1)}
              className="border-2 border-black bg-black p-2 text-white transition-colors duration-300 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isNew}
            >
              <Minus size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
