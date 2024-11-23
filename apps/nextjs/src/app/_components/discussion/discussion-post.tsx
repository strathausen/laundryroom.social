"use client";

import { useState } from "react";
import { Edit3, MenuIcon, Trash } from "lucide-react";
import { useSession } from "next-auth/react";

import type { RouterOutputs } from "@laundryroom/api";
import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@laundryroom/ui/popover";
import { toast } from "@laundryroom/ui/toast";

import { useDiscussions } from "~/hooks/use-discussions";
import { DiscussionComments } from "./discussion-comments";
import { DiscussionForm } from "./discussion-form";

interface Props {
  discussion: RouterOutputs["discussion"]["byGroupId"]["discussions"][number] & {
    isTemporary: boolean;
    isDeleting: boolean;
  };
  groupId: string;
}

export function DiscussionPost({ discussion, groupId }: Props) {
  const session = useSession();
  const discussions = useDiscussions({ groupId });
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  return (
    <Box
      key={discussion.id}
      className={`flex flex-col gap-2 px-4 py-3 ${discussions.deletingId === discussion.id ? "opacity-50" : ""} ${discussion.isTemporary ? "animate-pulse" : ""}`}
    >
      <div className="flex justify-between">
        <p className="h-9 text-sm font-semibold">
          {discussion.user.name ?? "anonymous"}
        </p>
        {session.data?.user.id === discussion.user.id &&
          discussions.deletingId !== discussion.id && (
            <div className="relative -right-2 -top-2 opacity-50 transition-opacity hover:opacity-100">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="p-2">
                    <MenuIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  sideOffset={4}
                  className="flex w-auto flex-col p-2"
                >
                  {showDeleteConfirmation ? (
                    <div className="flex flex-col items-center gap-2">
                      really delete??
                      <Button
                        onClick={() => discussions.delete(discussion.id)}
                        variant={"destructive"}
                        className="flex p-2"
                      >
                        yes delete!! 🔥🗑️
                      </Button>
                      <Button
                        onClick={() => setShowDeleteConfirmation(false)}
                        variant={"ghost"}
                        className="flex p-2"
                      >
                        nope 🙅 keep it
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        onClick={() => {
                          setShowDeleteConfirmation(true);
                        }}
                        variant={"ghost"}
                        className="flex justify-between gap-2"
                      >
                        delete <Trash className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={"ghost"}
                        className="flex justify-between gap-2"
                        onClick={() => setEditMode(true)}
                      >
                        edit
                        <Edit3 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          )}
      </div>
      {editMode ? (
        <DiscussionForm
          initialValues={{
            id: discussion.id,
            title: discussion.title,
            content: discussion.content,
          }}
          onSuccess={() => {
            setEditMode(false);
          }}
          onError={() => {
            toast.error("Oh darn it. Something went wrong. ¯\\_(ツ)_/¯");
          }}
          onCancel={() => setEditMode(false)}
          groupId={groupId}
        />
      ) : (
        <>
          <h2 className="text-xl uppercase">{discussion.title}</h2>
          <p className="underline decoration-green-400 decoration-4">
            {discussion.content}
          </p>
        </>
      )}
      <DiscussionComments
        discussionId={discussion.id}
        commentCount={discussion.commentCount}
      />
    </Box>
  );
}
