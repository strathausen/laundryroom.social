import { useState } from "react";
import { ChevronDown, MenuIcon, MessageCircle, Trash } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@laundryroom/ui/popover";
import { toast } from "@laundryroom/ui/toast";

import { useComments } from "~/hooks/use-comments";

export function DiscussionComments({
  discussionId,
  commentCount,
}: {
  discussionId: string;
  commentCount: number;
}) {
  const session = useSession();
  const [commentContent, setCommentContent] = useState("");
  const {
    addComment,
    deleteComment,
    loadComments,
    fetchOlderComments,
    isFetching,
    isFetched,
    isFetchingPreviousPage,
    isCreating,
    hasPreviousPage,
    comments,
  } = useComments(discussionId);

  const t = useTranslations();

  return (
    <>
      <div className="my-2">
        {!isFetched && commentCount > 0 && (
          <Button
            onClick={loadComments}
            disabled={isFetching}
            variant="plattenbau"
            className="mb-3"
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            load {commentCount} comment
            {commentCount > 1 && "s"}
          </Button>
        )}
        {hasPreviousPage && (
          <Button
            onClick={fetchOlderComments}
            disabled={isFetchingPreviousPage}
            variant="plattenbau"
            className="mb-3"
          >
            <ChevronDown className="mr-2 h-4 w-4" />
            {t("aqua_wise_gazelle_amaze")}
          </Button>
        )}
        <div className="flex flex-col gap-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className={`flex gap-2 bg-gray-100 p-2 ${
                comment.isDeleting ? "line-through opacity-50" : ""
              } ${comment.id.startsWith("temp-") ? "animate-pulse" : ""}`}
              title={new Date(comment.createdAt).toDateString()}
            >
              <p className="font-semibold">
                {comment.user.name ?? "anonymous"}:
              </p>
              <p className="flex-1">{comment.content}</p>
              {comment.user.id === session.data?.user.id &&
                !comment.isDeleting && (
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
                          await deleteComment(comment.id);
                        }}
                        variant="ghost"
                        className="flex justify-between gap-2"
                      >
                        {t("fuzzy_only_kestrel_learn")}{" "}
                        <Trash className="h-4 w-4" />
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
          await addComment(commentContent, session.data.user);
          setCommentContent("");
        }}
      >
        <Input
          value={commentContent}
          disabled={isCreating}
          onChange={(e) => setCommentContent(e.target.value)}
        />
        <Button
          type="submit"
          variant="brutal"
          disabled={isCreating || commentContent.length < 4}
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          comment
        </Button>
      </form>
    </>
  );
}
