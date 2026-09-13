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

import type { RouterOutputs } from "@laundryroom/api";
import { AutoHeightTextarea } from "@laundryroom/ui/auto-height-textarea";
import { AutoWidthTextarea } from "@laundryroom/ui/auto-width-textarea";
import { toast } from "@laundryroom/ui/toast";

import { authClient } from "~/auth-client";
import { api } from "~/trpc/react";

export type PledgeItemData = NonNullable<
  RouterOutputs["pledge"]["getPledgeBoard"]
>["pledges"][number] & {
  /** item was added locally and not saved to the server yet */
  isNew?: boolean;
};

/** what the server knows about an item after it was saved */
export interface SavedPledgeItem {
  id: string;
  title: string;
  description: string;
  capacity: number;
}

// keep in sync with the bounds enforced by the pledge router
const MAX_QUANTITY = 999;
const clampQuantity = (n: number) => Math.min(Math.max(n, 0), MAX_QUANTITY);

interface PledgeItemProps {
  item: PledgeItemData;
  isAdmin: boolean;
  /** the viewer has rsvp'd "going" and may pledge */
  canPledge: boolean;
  pledgeBoardId: string;
  sortOrder: number;
  disabled?: boolean;
  onDelete?: () => void;
  onSaved?: (saved: SavedPledgeItem) => void;
}

export function PledgeItem({
  item,
  isAdmin,
  canPledge,
  pledgeBoardId,
  sortOrder,
  onDelete,
  onSaved,
  disabled,
}: PledgeItemProps) {
  const upsertPledgeMutation = api.pledge.upsertPledge.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const deletePledgeMutation = api.pledge.deletePledge.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const fulfillmentMutation = api.pledge.setFulfillment.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const [editMode, setEditMode] = useState(!!item.isNew);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isNew, setIsNew] = useState(item.isNew);
  const [id, setId] = useState(item.id);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [capacity, setCapacity] = useState(item.capacity);
  const [fulfillments, setFulfillments] = useState(item.fulfillments);
  const session = authClient.useSession();
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
    try {
      const res = await upsertPledgeMutation.mutateAsync({
        id: isNew ? undefined : id,
        title,
        description,
        capacity,
        pledgeBoardId,
        sortOrder,
      });
      if (isNew) {
        setId(res.id);
        setIsNew(false);
      }
      setEditMode(false);
      onSaved?.({ id: res.id, title, description, capacity });
    } catch {
      // the mutation's onError already showed a toast; stay in edit mode so nothing is lost
    }
  };

  const handleDelete = async () => {
    if (!isNew) {
      try {
        await deletePledgeMutation.mutateAsync(id);
      } catch {
        // the mutation's onError already showed a toast; keep the item
        return;
      }
    }
    onDelete?.();
  };

  const handlePledge = async (delta: number) => {
    if (!currentUserId) return;
    const myQuantity =
      fulfillments.find((fulfillment) => fulfillment.user.id === currentUserId)
        ?.quantity ?? 0;
    const quantity = clampQuantity(myQuantity + delta);
    if (quantity === myQuantity) return;
    const previous = fulfillments;
    // optimistic update, rolled back below if the server rejects the pledge
    setFulfillments((prev) => {
      const mine = prev.some(
        (fulfillment) => fulfillment.user.id === currentUserId,
      );
      const next = mine
        ? prev.map((fulfillment) =>
            fulfillment.user.id === currentUserId
              ? { ...fulfillment, quantity }
              : fulfillment,
          )
        : [
            ...prev,
            {
              quantity,
              user: {
                id: currentUserId,
                name: session.data?.user.name ?? "",
              },
            },
          ];
      return next.filter((fulfillment) => fulfillment.quantity > 0);
    });
    try {
      await fulfillmentMutation.mutateAsync({ pledgeId: id, quantity });
    } catch {
      setFulfillments(previous);
    }
  };

  const pledgedAmount = fulfillments.reduce(
    (acc, fulfillment) => acc + fulfillment.quantity,
    0,
  );
  const pledgeDisabled =
    Boolean(isNew) ||
    Boolean(disabled) ||
    !canPledge ||
    fulfillmentMutation.isPending;

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
              maxLength={255}
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
                const parsed = parseInt(v, 10);
                setCapacity(Number.isNaN(parsed) ? 0 : clampQuantity(parsed));
              }}
              value={capacity.toString()}
              readonly={!editMode}
              onKeyUp={async (key) => {
                switch (key) {
                  case "Enter":
                    await handleEdit();
                    break;
                  case "ArrowUp":
                    setCapacity((prev) => clampQuantity(prev + 1));
                    break;
                  case "ArrowDown":
                    setCapacity((prev) => clampQuantity(prev - 1));
                    break;
                }
              }}
            />
          </div>
          {isAdmin && (
            <>
              <button
                onClick={async () => {
                  if (editMode) {
                    // leaves edit mode only when the save succeeded
                    await handleEdit();
                  } else {
                    setEditMode(true);
                  }
                }}
                disabled={upsertPledgeMutation.isPending}
                className={`${editMode ? "bg-green-600 hover:bg-green-700" : "bg-blue-500 hover:bg-blue-600"} p-1 text-white transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {editMode ? <CheckIcon size={20} /> : <Edit2 size={20} />}
              </button>
              <button
                onClick={handleDelete}
                disabled={deletePledgeMutation.isPending}
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
          <h4 className="font-bold">pledgers:</h4>
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
              disabled={pledgeDisabled}
            >
              <Plus size={20} />
            </button>
            <button
              onClick={() => handlePledge(-1)}
              className="border-2 border-black bg-black p-2 text-white transition-colors duration-300 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
              disabled={pledgeDisabled}
            >
              <Minus size={20} />
            </button>
            {!canPledge && !disabled && (
              <span className="text-sm text-gray-600">
                rsvp &quot;going&quot; to pledge
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
