import { useEffect, useState } from "react";
import { ChevronDown, MenuIcon, MessageCircle, Trash } from "lucide-react";
import { useSession } from "next-auth/react";

import type { RouterOutputs } from "@laundryroom/api";
import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@laundryroom/ui/popover";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

export function DiscussionComments({
  discussionId,
  commentCount,
}: {
  discussionId: string;
  commentCount: number;
}) {
  const session = useSession();
  const [commentContent, setCommentContent] = useState("");
  const [deletedComments, setDeletedComments] = useState<string[]>([]);
  const createCommentMutation = api.discussion.createComment.useMutation();
  const [postedComments, setPostedComments] = useState<
    RouterOutputs["discussion"]["comments"]["comments"]
  >([]);
  const commentsQuery = api.discussion.comments.useInfiniteQuery(
    { discussionId, limit: 10 },
    {
      enabled: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getPreviousPageParam: (lastPage) => lastPage.prevCursor,
    },
  );
  const deleteCommentMutation = api.discussion.deleteComment.useMutation();

  useEffect(() => {
    if (commentsQuery.isFetched) {
      setPostedComments([]);
    }
  }, [commentsQuery.isFetched]);
  return (
    <>
      <div className="my-2">
        {!commentsQuery.isFetched && commentCount > 0 && (
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
            load {commentCount} comment
            {commentCount > 1 && "s"}
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
            .filter((comment) => !deletedComments.includes(comment.id))
            .map((comment) => (
              <div
                key={comment.id}
                className={`flex gap-2 bg-gray-100 p-2 ${comment.id === deleteCommentMutation.variables ? "line-through opacity-50" : ""} ${comment.id.startsWith("temp-") ? "animate-pulse" : ""}`}
                title={comment.createdAt.toDateString()}
              >
                <p className="font-semibold">
                  {comment.user.name ?? "anonymous"}:
                </p>
                <p className="flex-1">{comment.content}</p>
                {comment.user.id === session.data?.user.id && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="h-6 p-0 pr-1 opacity-50"
                      >
                        <MenuIcon className="h-4 w-4 p-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      sideOffset={4}
                      className="flex w-auto flex-col p-2"
                    >
                      <Button
                        onClick={async () => {
                          await deleteCommentMutation.mutateAsync(comment.id);
                          setDeletedComments((deletedComments) => [
                            ...deletedComments,
                            comment.id,
                          ]);
                        }}
                        variant={"ghost"}
                        className="flex justify-between gap-2"
                      >
                        delete?? <Trash className="h-4 w-4" />
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
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
          const tempId = "temp-" + Math.random().toString(36).substring(7);
          setPostedComments((postedComments) => [
            ...postedComments,
            {
              id: tempId,
              content: commentContent,
              user: {
                ...session.data.user,
                name: session.data.user.name ?? "anonymous",
                image: session.data.user.image ?? null,
              },
              createdAt: new Date(),
            },
          ]);
          const [newComment] = await createCommentMutation.mutateAsync({
            discussionId,
            content: commentContent,
          });
          if (!newComment) {
            setPostedComments((postedComments) =>
              postedComments.filter((comment) => comment.id !== tempId),
            );
            return;
          }
          setPostedComments((postedComments) =>
            postedComments.map((comment) =>
              comment.id === tempId ? { ...comment, ...newComment } : comment,
            ),
          );
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
    </>
  );
}
