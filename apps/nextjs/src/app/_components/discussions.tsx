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

import { api } from "~/trpc/react";
import { DiscussionComments } from "./discussion-comments";
import { DiscussionForm } from "./discussion-form";

function DiscussionPost({
  discussion,
  onDeleted,
  onEdited,
  groupId,
}: {
  discussion: RouterOutputs["discussion"]["byGroupId"]["discussions"][number];
  onDeleted: () => void;
  onEdited: () => void;
  groupId: string;
}) {
  const session = useSession();
  const deleteDiscussionMutation = api.discussion.delete.useMutation();
  const [editMode, setEditMode] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  return (
    <Box
      key={discussion.id}
      className={`flex flex-col gap-2 px-4 py-3 ${deleteDiscussionMutation.isPending ? "opacity-50" : ""}`}
    >
      <div className="flex justify-between">
        <p className="text-sm font-semibold">
          {discussion.user.name ?? "anonymous"}
        </p>
        {session.data?.user.id === discussion.user.id && (
          <div className="opacity-50 transition-opacity hover:opacity-100">
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
                      onClick={async () => {
                        await deleteDiscussionMutation.mutateAsync(
                          discussion.id,
                        );
                        onDeleted();
                      }}
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
            onEdited();
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

export function DiscussionWidget(props: { groupId: string }) {
  const [showNewDiscussionForm, setShowNewDiscussionForm] = useState(false);
  const discussionsQuery = api.discussion.byGroupId.useInfiniteQuery(
    { groupId: props.groupId },
    { getNextPageParam: (lastPage) => lastPage.nextCursor },
  );
  return (
    <div>
      <Button
        onClick={() => setShowNewDiscussionForm(true)}
        className="mx-auto flex"
      >
        write something
      </Button>
      {showNewDiscussionForm && (
        <DiscussionForm
          groupId={props.groupId}
          onSuccess={async () => {
            await discussionsQuery.refetch();
            setShowNewDiscussionForm(false);
          }}
          onError={() => {
            toast.error("Oh darn it. Something went wrong. ¯\\_(ツ)_/¯");
          }}
          onCancel={() => setShowNewDiscussionForm(false)}
        />
      )}
      <div className="m-auto my-7 flex max-w-3xl flex-col gap-5">
        {discussionsQuery.data?.pages
          .flatMap((page) => page.discussions)
          .map((discussion) => (
            <DiscussionPost
              discussion={discussion}
              key={discussion.id}
              groupId={props.groupId}
              onDeleted={() => discussionsQuery.refetch()}
              onEdited={() => discussionsQuery.refetch()}
            />
          ))}
        {discussionsQuery.hasNextPage && (
          <Button
            onClick={() => discussionsQuery.fetchNextPage()}
            className="mx-auto"
          >
            load more
          </Button>
        )}
      </div>
    </div>
  );
}
