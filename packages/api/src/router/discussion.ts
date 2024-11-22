import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, count, desc, eq, lte } from "@laundryroom/db";
import {
  Comment,
  Discussion,
  GroupMember,
  UpsertDiscussionSchema,
} from "@laundryroom/db/schema";
import { classifyModeration } from "@laundryroom/llm";

import { protectedProcedure } from "../trpc";

export const discussionRouter = {
  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const discussion = await ctx.db.query.Discussion.findFirst({
        where: eq(Discussion.id, input.id),
        columns: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          groupId: true,
        },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
          comments: {
            columns: { id: true, content: true, createdAt: true },
            with: {
              user: {
                columns: { id: true, name: true, image: true },
              },
            },
          },
        },
      });
      if (!discussion) {
        throw new Error("Discussion not found");
      }
      const userId = ctx.session.user.id;
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
        return { ...discussion, comments: [] };
      }
      return discussion;
    }),

  upsert: protectedProcedure
    .input(UpsertDiscussionSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, userId),
        ),
      });
      if (!membership) {
        throw new Error("Not a member of the group");
      }
      const { moderationStatus } = await classifyModeration(input.content);
      if (input.id) {
        return ctx.db
          .update(Discussion)
          .set({ ...input, moderationStatus })
          .where(
            and(eq(Discussion.id, input.id), eq(Discussion.userId, userId)),
          );
      }
      return ctx.db
        .insert(Discussion)
        .values({ ...input, userId, moderationStatus })
        .returning({ id: Discussion.id });
    }),

  delete: protectedProcedure.input(z.string()).mutation(({ ctx, input }) => {
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
      const membershipQuery = ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      const [counts, discussions, membership] = await Promise.all([
        countsQuery,
        discussionsQuery,
        membershipQuery,
      ]);
      if (!membership || membership.role === "banned") {
        return { discussions: [], nextCursor: undefined };
      }
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
