import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, lte } from "@laundryroom/db";
import { Comment, Discussion, GroupMember } from "@laundryroom/db/schema";
import { sendEmail } from "@laundryroom/email";
import { classifyModeration } from "@laundryroom/llm";

import { protectedProcedure } from "../trpc";

export const commentRouter = {
  comments: protectedProcedure
    .input(
      z.object({
        discussionId: z.string(),
        cursor: z.string().nullish(),
        limit: z.number().max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const discussionQuery = ctx.db
        .select({ id: Discussion.id, groupId: Discussion.groupId })
        .from(Discussion)
        .where(eq(Discussion.id, input.discussionId));
      const membershipQuery = discussionQuery.then(([discussion]) =>
        discussion
          ? ctx.db
              .select({ role: GroupMember.role })
              .from(GroupMember)
              .where(
                and(
                  eq(GroupMember.groupId, discussion.groupId),
                  eq(GroupMember.userId, ctx.session.user.id),
                ),
              )
          : [],
      );
      const commentsQuery = await ctx.db.query.Comment.findMany({
        where: and(
          eq(Comment.discussionId, input.discussionId),
          eq(Comment.moderationStatus, "ok"),
          input.cursor ? lte(Comment.createdAt, input.cursor) : undefined,
        ),
        columns: { id: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
        },
        limit: input.limit + 1,
        orderBy: desc(Comment.createdAt),
      });
      const [[membership], comments] = await Promise.all([
        membershipQuery,
        commentsQuery,
      ]);
      if (!membership || membership.role === "banned") {
        return { comments: [], nextCursor: undefined, prevCursor: undefined };
      }
      const nextComment =
        comments.length > input.limit ? comments.pop() : undefined;
      return {
        comments: comments.reverse(),
        nextCursor: undefined,
        prevCursor: nextComment?.createdAt ?? undefined,
        cursor: input.cursor,
      };
    }),

  deleteComment: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.db
        .delete(Comment)
        .where(and(eq(Comment.id, input), eq(Comment.userId, userId)));
    }),

  createComment: protectedProcedure
    .input(z.object({ discussionId: z.string(), content: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const discussion = await ctx.db.query.Discussion.findFirst({
        where: eq(Discussion.id, input.discussionId),
      });
      if (!discussion) {
        throw new Error("Discussion not found");
      }
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, discussion.groupId),
          eq(GroupMember.userId, userId),
        ),
      });
      if (!membership) {
        throw new Error("Not a member of the group");
      }
      if (membership.role === "banned") {
        throw new Error("Something went wrong");
      }
      const { moderationStatus } = await classifyModeration(input.content);
      // get all users involved in the discussion
      const comments = await ctx.db.query.Comment.findMany({
        where: eq(Comment.discussionId, input.discussionId),
        with: { user: true },
      });
      const users: Record<string, (typeof comments)[number]["user"]> = {};
      comments.forEach((comment) => (users[comment.userId] = comment.user));
      // notify participating users
      await Promise.all(
        Object.keys(users).map(async (userId) => {
          const user = users[userId];
          if (!user?.email) {
            return;
          }
          if (user.id === userId) {
            return;
          }
          const { email } = user;
          await sendEmail(email, "newComment", {
            user,
            discussion,
            comment: input,
            groupId: discussion.groupId,
          });
        }),
      );
      return ctx.db
        .insert(Comment)
        .values({
          ...input,
          userId,
          groupId: discussion.groupId,
          moderationStatus,
        })
        .returning({ id: Comment.id });
    }),
} satisfies TRPCRouterRecord;
