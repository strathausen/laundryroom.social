import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { and, count, desc, eq, lte } from "@laundryroom/db";
import {
  Comment,
  Discussion,
  GroupMember,
  UpsertDiscussionSchema,
} from "@laundryroom/db/schema";
import { classifyModeration } from "@laundryroom/llm";

import { getGroupAccess, isActiveMember } from "../access";
import { protectedProcedure } from "../trpc";

type ModerationStatus = NonNullable<
  typeof Discussion.$inferSelect.moderationStatus
>;
/** statuses assigned by moderation that an author's edit must not reset */
const lockedModerationStatuses: ModerationStatus[] = [
  "rejected",
  "review",
  "reported",
];

export const discussionRouter = {
  upsert: protectedProcedure
    .input(UpsertDiscussionSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const existing = input.id
        ? await ctx.db.query.Discussion.findFirst({
            where: and(
              eq(Discussion.id, input.id),
              eq(Discussion.userId, userId),
            ),
            columns: { id: true, groupId: true, moderationStatus: true },
          })
        : undefined;
      if (input.id && !existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "discussion not found",
        });
      }
      // an existing discussion stays in its group, whatever groupId the client sends
      const groupId = existing?.groupId ?? input.groupId;
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, groupId),
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
      if (existing) {
        // a status set by moderation sticks; re-classifying would let an edit clear it
        const moderationStatus =
          existing.moderationStatus &&
          lockedModerationStatuses.includes(existing.moderationStatus)
            ? existing.moderationStatus
            : (await classifyModeration(input.content)).moderationStatus;
        return ctx.db
          .update(Discussion)
          .set({ title: input.title, content: input.content, moderationStatus })
          .where(
            and(eq(Discussion.id, existing.id), eq(Discussion.userId, userId)),
          );
      }
      const { moderationStatus } = await classifyModeration(input.content);
      return ctx.db
        .insert(Discussion)
        .values({ ...input, userId, moderationStatus })
        .returning({ id: Discussion.id })
        .then((result) => result[0]);
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.db
        .delete(Discussion)
        .where(and(eq(Discussion.id, input), eq(Discussion.userId, userId)));
    }),

  /**
   * List discussions by group ID
   */
  byGroupId: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        cursor: z.string().nullish(),
        limit: z.number().max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      // discussions are for members only (banned users and open join
      // requests get an empty list, nsfw groups need the opt-in)
      const access = await getGroupAccess(
        ctx.db,
        input.groupId,
        ctx.session.user.id,
      );
      if (!access?.canSeeMemberContent) {
        return { discussions: [], nextCursor: undefined };
      }
      const countsQuery = ctx.db
        .select({
          count: count(Comment.id),
          discussionId: Comment.discussionId,
        })
        .from(Comment)
        .where(
          and(
            eq(Comment.groupId, input.groupId),
            eq(Comment.moderationStatus, "ok"),
          ),
        )
        .groupBy(Comment.discussionId);
      const discussionsQuery = ctx.db.query.Discussion.findMany({
        where: and(
          eq(Discussion.groupId, input.groupId),
          eq(Discussion.moderationStatus, "ok"),
          input.cursor ? lte(Discussion.createdAt, input.cursor) : undefined,
        ),
        columns: { id: true, title: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
        },
        limit: input.limit + 1,
        orderBy: desc(Discussion.createdAt),
      });
      const [counts, discussions] = await Promise.all([
        countsQuery,
        discussionsQuery,
      ]);
      const nextDiscussion =
        discussions.length > input.limit ? discussions.pop() : undefined;
      return {
        discussions: discussions.map((discussion) => {
          const count = counts.find((c) => c.discussionId === discussion.id);
          return { ...discussion, commentCount: count?.count ?? 0 };
        }),
        nextCursor: nextDiscussion?.createdAt ?? undefined,
        cursor: input.cursor,
      };
    }),
} satisfies TRPCRouterRecord;
