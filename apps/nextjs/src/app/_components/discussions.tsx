"use client";

import { useState } from "react";
import {
  ChevronDown,
  Edit3,
  MenuIcon,
  MessageCircle,
  Trash,
} from "lucide-react";
import { useSession } from "next-auth/react";

import type { RouterOutputs } from "@laundryroom/api";
import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@laundryroom/ui/popover";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";
import { DiscussionForm } from "./discussion-form";

function DiscussionPost({
  discussion,
  onDeleted,
  onEdited,
  groupId,
}: {
  discussion: RouterOutputs["discussion"]["byGroupId"][number];
  onDeleted: () => void;
  onEdited: () => void;
  groupId: string;
}) {
  const session = useSession();
  const [commentContent, setCommentContent] = useState("");
  const createCommentMutation = api.discussion.createComment.useMutation();
  const deleteDiscussionMutation = api.discussion.delete.useMutation();
  const [editMode, setEditMode] = useState(false);
  const commentsQuery = api.discussion.comments.useInfiniteQuery(
    { discussionId: discussion.id, limit: 5 },
    {
      enabled: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getPreviousPageParam: (lastPage) => lastPage.prevCursor,
    },
  );
  const [postedComments, setPostedComments] = useState<
    RouterOutputs["discussion"]["comments"]["comments"]
  >([]);
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
                <Button
                  onClick={async () => {
                    await deleteDiscussionMutation.mutateAsync(discussion.id);
                    onDeleted();
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
      <div className="my-2">
        {!commentsQuery.isFetched && discussion.commentCount > 0 && (
          <Button
            onClick={async () => {
              await commentsQuery.refetch();
              setPostedComments([]);
            }}
            disabled={commentsQuery.isFetching}
            variant="plattenbau"
            className="mb-3"
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            load {discussion.commentCount} comment
            {discussion.commentCount > 1 && "s"}
          </Button>
        )}
        {commentsQuery.hasPreviousPage && (
          <Button
            onClick={() => commentsQuery.fetchPreviousPage()}
            disabled={commentsQuery.isFetchingPreviousPage}
            variant="plattenbau"
            className="mb-3"
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            load older comments
          </Button>
        )}
        <div className="flex flex-col gap-2">
          {(commentsQuery.data?.pages ?? [])
            .flatMap((page) => page.comments)
            .concat(postedComments)
            .map((comment) => (
              <div
                key={comment.id}
                className="flex gap-2 bg-gray-100 p-2"
                title={comment.createdAt.toDateString()}
              >
                <p className="font-semibold">
                  {comment.user.name ?? "anonymous"}:
                </p>
                <p>{comment.content}</p>
              </div>
            ))}
        </div>
      </div>
      <form
        className="flex gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!session.data?.user.id) {
            toast.error("You need to be signed in to comment");
            return;
          }
          setPostedComments((postedComments) => [
            ...postedComments,
            {
              id: Math.random().toString(),
              content: commentContent,
              user: {
                ...session.data.user,
                name: session.data.user.name ?? "anonymous",
                image: session.data.user.image ?? null,
              },
              createdAt: new Date(),
            },
          ]);
          await createCommentMutation.mutateAsync({
            discussionId: discussion.id,
            content: commentContent,
          });
          setCommentContent("");
        }}
      >
        <Input
          value={commentContent}
          disabled={createCommentMutation.isPending}
          onChange={(e) => setCommentContent(e.target.value)}
        />
        <Button
          type="submit"
          variant="brutal"
          disabled={
            createCommentMutation.isPending || commentContent.length < 4
          }
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          comment
        </Button>
      </form>
    </Box>
  );
}

export function DiscussionWidget(props: {
  groupId: string;
  isMember: boolean;
}) {
  const [showNewDiscussionForm, setShowNewDiscussionForm] = useState(false);
  const discussionsQuery = api.discussion.byGroupId.useQuery({
    groupId: props.groupId,
  });
  return (
    <div>
      {props.isMember ? (
        <Button
          onClick={() => setShowNewDiscussionForm(true)}
          className="mx-auto flex"
        >
          write something
        </Button>
      ) : (
        <div>
          <p>you need to be a member to post</p>
        </div>
      )}
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
        {discussionsQuery.data?.map((discussion) => (
          <DiscussionPost
            discussion={discussion}
            key={discussion.id}
            groupId={props.groupId}
            onDeleted={() => discussionsQuery.refetch()}
            onEdited={() => discussionsQuery.refetch()}
          />
        ))}
      </div>
    </div>
  );
}
