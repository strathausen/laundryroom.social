import { useEffect, useState } from "react";

import type { RouterOutputs } from "@laundryroom/api";

import { api } from "~/trpc/react";

export function useComments(discussionId: string) {
  const [postedComments, setPostedComments] = useState<
    RouterOutputs["comment"]["comments"]["comments"]
  >([]);
  const [deletedComments, setDeletedComments] = useState<string[]>([]);

  const commentsQuery = api.comment.comments.useInfiniteQuery(
    { discussionId },
    {
      enabled: false,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      getPreviousPageParam: (lastPage) => lastPage.prevCursor,
    },
  );

  const createCommentMutation = api.comment.createComment.useMutation();
  const deleteCommentMutation = api.comment.deleteComment.useMutation();

  useEffect(() => {
    if (commentsQuery.isFetched) {
      setPostedComments([]);
    }
  }, [commentsQuery.isFetched]);

  const loadComments = async () => {
    await commentsQuery.refetch();
    setPostedComments([]);
  };

  const fetchOlderComments = async () => {
    await commentsQuery.fetchPreviousPage();
  };

  const addComment = async (
    content: string,
    user: { id: string; name?: string | null; image?: string | null },
  ) => {
    const tempId = "temp-" + Math.random().toString(36).substring(7);
    setPostedComments((prev) => [
      ...prev,
      {
        id: tempId,
        content,
        user: {
          ...user,
          name: user.name ?? "anonymous",
          image: user.image ?? null,
        },
        createdAt: new Date().toISOString(),
      },
    ]);

    const [newComment] = await createCommentMutation.mutateAsync({
      discussionId,
      content,
    });

    if (!newComment) {
      setPostedComments((prev) =>
        prev.filter((comment) => comment.id !== tempId),
      );
      return;
    }

    setPostedComments((prev) =>
      prev.map((comment) =>
        comment.id === tempId ? { ...comment, ...newComment } : comment,
      ),
    );
  };

  const deleteComment = async (commentId: string) => {
    await deleteCommentMutation.mutateAsync(commentId);
    setDeletedComments((prev) => [...prev, commentId]);
  };

  return {
    addComment,
    deleteComment,
    loadComments,
    fetchOlderComments,
    isFetching: commentsQuery.isFetching,
    isFetchingPreviousPage: commentsQuery.isFetchingPreviousPage,
    isCreating: createCommentMutation.isPending,
    isFetched: commentsQuery.isFetched,
    hasPreviousPage: commentsQuery.hasPreviousPage,
    comments:
      commentsQuery.data?.pages
        .flatMap((page) => page.comments)
        .concat(postedComments)
        .map((comment) => ({
          ...comment,
          isDeleting: deleteCommentMutation.variables === comment.id,
        }))
        .filter((comment) => !deletedComments.includes(comment.id)) ?? [],
  };
}
