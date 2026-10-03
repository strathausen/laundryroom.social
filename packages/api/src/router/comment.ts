import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, inArray, lte } from "@laundryroom/db";
import { Comment, Discussion, GroupMember } from "@laundryroom/db/schema";
import { sendEmail } from "@laundryroom/email";
import { classifyModeration } from "@laundryroom/llm";

import {
  getGroupAccess,
  isActiveMember,
  isActiveMemberRow,
  nsfwAllowed,
} from "../access";
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
      const empty = {
        comments: [],
        nextCursor: undefined,
        prevCursor: undefined,
      };
      // discussions that moderation hid keep their comments hidden as well
      const discussion = await ctx.db.query.Discussion.findFirst({
        where: and(
          eq(Discussion.id, input.discussionId),
          eq(Discussion.moderationStatus, "ok"),
        ),
        columns: { groupId: true },
      });
      if (!discussion) {
        return empty;
      }
      // comments are for members only (banned users and open join requests
      // get an empty list, nsfw groups need the opt-in)
      const access = await getGroupAccess(
        ctx.db,
        discussion.groupId,
        ctx.session.user.id,
      );
      if (!access?.canSeeMemberContent) {
        return empty;
      }
      const comments = await ctx.db.query.Comment.findMany({
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
      // discussions that moderation hid take no comments (and send no emails)
      const discussion = await ctx.db.query.Discussion.findFirst({
        where: and(
          eq(Discussion.id, input.discussionId),
          eq(Discussion.moderationStatus, "ok"),
        ),
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
      // banned users must not learn about the ban, open join requests get
      // the same answer
      if (!isActiveMember(membership.role)) {
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
      // only people who are still members of the group get the email (no
      // bans, no join requests), in nsfw groups only those who opted in
      const recipients = await ctx.db.query.GroupMember.findMany({
        where: and(
          eq(GroupMember.groupId, discussion.groupId),
          inArray(GroupMember.userId, [...candidateIds]),
          isActiveMemberRow(),
        ),
        with: {
          user: { columns: { id: true, name: true, email: true, flags: true } },
          group: { columns: { status: true } },
        },
      });
      // the comment is already saved, so a failing email must not fail the
      // mutation. sends stay sequential on purpose: resend rate-limits bursts
      // (2 requests/second), so firing all sends at once would drop most of them
      for (const { user, group } of recipients) {
        if (!nsfwAllowed(group.status, user.flags)) {
          continue;
        }
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
