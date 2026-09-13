import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, inArray, lte, ne } from "@laundryroom/db";
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
        membershipQuery.execute(),
        commentsQuery.execute(),
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
        columns: {
          id: true,
          title: true,
          content: true,
          groupId: true,
          userId: true,
        },
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
      // typed as the column's literal union rather than the llm package's enum,
      // so the "ok" check below is a plain string comparison
      const moderationStatus: typeof Comment.$inferInsert.moderationStatus = (
        await classifyModeration(input.content)
      ).moderationStatus;
      const inserted = await ctx.db
        .insert(Comment)
        .values({
          ...input,
          userId,
          groupId: discussion.groupId,
          moderationStatus,
        })
        .returning({ id: Comment.id });
      if (moderationStatus !== "ok") {
        return inserted;
      }

      // notify everyone who visibly took part in the thread plus the discussion
      // author, except the commenter themselves. comments that moderation hid
      // don't count as participation.
      const participants = await ctx.db.query.Comment.findMany({
        where: and(
          eq(Comment.discussionId, input.discussionId),
          eq(Comment.moderationStatus, "ok"),
        ),
        columns: { userId: true },
      });
      const candidateIds = new Set(participants.map((c) => c.userId));
      candidateIds.add(discussion.userId);
      candidateIds.delete(userId);
      if (candidateIds.size === 0) {
        return inserted;
      }
      // only people who are still (non-banned) members of the group get the email
      const recipients = await ctx.db.query.GroupMember.findMany({
        where: and(
          eq(GroupMember.groupId, discussion.groupId),
          inArray(GroupMember.userId, [...candidateIds]),
          ne(GroupMember.role, "banned"),
        ),
        with: {
          user: { columns: { id: true, name: true, email: true } },
        },
      });
      // the comment is already saved, so a failing email must not fail the
      // mutation. sends stay sequential on purpose: resend rate-limits bursts
      // (2 requests/second), so firing all sends at once would drop most of them
      for (const { user } of recipients) {
        try {
          await sendEmail(user.email, "newComment", {
            user,
            discussion,
            comment: input,
            groupId: discussion.groupId,
          });
        } catch (error) {
          console.error("failed to send newComment email", error);
        }
      }
      return inserted;
    }),
} satisfies TRPCRouterRecord;
