import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, count, eq } from "@laundryroom/db";
import {
  Comment,
  Discussion,
  GroupMember,
  UpsertDiscussionSchema,
} from "@laundryroom/db/schema";

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

  create: protectedProcedure
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
      return ctx.db.insert(Discussion).values({ ...input, userId });
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
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      const countsQuery = ctx.db
        .select({
          count: count(Comment.id),
          discussionId: Comment.discussionId,
        })
        .from(Comment)
        .groupBy(Comment.discussionId);
      const discussionsQuery = ctx.db.query.Discussion.findMany({
        where: eq(Discussion.groupId, input.groupId),
        columns: { id: true, title: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
        },
      });
      const membershipQuery = ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      return Promise.all([countsQuery, discussionsQuery, membershipQuery]).then(
        ([counts, discussions, membership]) => {
          if (!membership || membership.role === "banned") {
            return [];
          }
          return discussions.map((discussion) => {
            const count = counts.find((c) => c.discussionId === discussion.id);
            return { ...discussion, commentCount: count?.count ?? 0 };
          });
        },
      );
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
      return ctx.db
        .insert(Comment)
        .values({ ...input, userId, groupId: discussion.groupId });
    }),

  comments: protectedProcedure
    .input(z.object({ discussionId: z.string() }))
    .query(async ({ ctx, input }) => {
      // TODO check if user is a member of the group of the discussion
      return ctx.db.query.Comment.findMany({
        where: eq(Comment.discussionId, input.discussionId),
        columns: { id: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
        },
      });
    }),
} satisfies TRPCRouterRecord;
