import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, desc, eq, sql } from "@laundryroom/db";
import { Group, GroupMember, Meetup } from "@laundryroom/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

export const groupRouter = {
  all: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.Group.findMany({
      columns: { id: true, name: true, description: true, image: true },
      where: and(eq(Group.moderationStatus, "ok"), eq(Group.status, "active")),
      orderBy: desc(Group.createdAt),
    });
  }),

  search: publicProcedure
    .input(z.object({ query: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.query.Group.findMany({
        columns: { id: true, name: true, description: true, image: true },
        where: and(
          sql`(
            setweight(to_tsvector("Group"."name"), 'A') ||
            setweight(to_tsvector("Group"."description"), 'B') ||
            setweight(to_tsvector("Group"."ai_search_text"), 'C')
            @@ plainto_tsquery(${input.query})
        )`,
          eq(Group.moderationStatus, "ok"),
          eq(Group.status, "active"),
        ),
        orderBy: desc(Group.createdAt),
      });
    }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = ctx.session?.user;
      const groupQuery = ctx.db.query.Group.findFirst({
        where: eq(Group.id, input.id),
        with: {
          members: {
            limit: 10,
            orderBy: desc(GroupMember.joinedAt),
          },
          meetups: {
            limit: 10,
            orderBy: desc(Meetup.createdAt),
          },
        },
      });
      const membershipQuery = user
        ? ctx.db.query.GroupMember.findFirst({
            where: and(
              eq(GroupMember.groupId, input.id),
              eq(GroupMember.userId, user.id),
            ),
          })
        : null;
      const [group, membership] = await Promise.all([
        groupQuery,
        membershipQuery,
      ]);
      return { group, membership };
    }),

  upsert: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        description: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        // also check for user permissions, only group admins or owners can update
        const membership = await ctx.db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, input.id),
            eq(GroupMember.userId, ctx.session.user.id),
          ),
        });
        if (!["owner", "admin"].includes(membership?.role ?? "")) {
          throw new Error("not authorized");
        }
        return ctx.db.update(Group).set(input).where(eq(Group.id, input.id));
      }
      return ctx.db.transaction(async (tx) => {
        const [group] = await tx
          .insert(Group)
          .values(input)
          .returning({ id: Group.id });
        if (!group) {
          throw new Error("failed to create group");
        }
        await tx.insert(GroupMember).values({
          groupId: group.id,
          userId: ctx.session.user.id,
          role: "owner",
        });
        return group;
      });
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      // check if the current user is the owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (membership?.role !== "owner") {
        throw new Error("not authorized");
      }
      return ctx.db.delete(Group).where(eq(Group.id, input));
    }),

  join: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.insert(GroupMember).values({
        groupId: input.groupId,
        userId: ctx.session.user.id,
        role: "member",
      });
    }),

  leave: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, ctx.session.user.id),
          ),
        );
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // check if the current user is an admin or owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("not authorized");
      }
      // user to remove should not be the owner
      if (membership?.userId === input.userId) {
        throw new Error("cannot remove owner");
      }
      return ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, input.userId),
          ),
        );
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        status: z.enum(["active", "archived", "hidden"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // check if the current user is an admin or owner
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.userId, ctx.session.user.id),
        ),
      });
      if (!["owner", "admin"].includes(membership?.role ?? "")) {
        throw new Error("not authorized");
      }
      return ctx.db
        .update(Group)
        .set({ status: input.status })
        .where(eq(Group.id, input.groupId));
    }),

  members: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(({ ctx, input }) => {
      // check if the user searching is also a member
      return ctx.db.query.GroupMember.findMany({
        where: eq(GroupMember.groupId, input.groupId),
      });
    }),

  changeRole: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        userId: z.string(),
        // role: GroupMemberRole,
        // role: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      return ctx.db
        .update(GroupMember)
        .set({ role: "member" })
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, input.userId),
          ),
        );
    }),

  // changeMemberStatus: protectedProcedure
  //   .input(
  //     z.object({
  //       groupId: z.string(),
  //       userId: z.string(),
  //       // status: GroupMemberRole,
  //       status: z.string(),
  //     }),
  //   )
  //   .mutation(({ ctx, input }) => {
  //     return ctx.db
  //       .update(Group)
  //       .set({ : 'going' })
  //       .where(
  //         and(
  //           eq(GroupMember.groupId, input.groupId),
  //           eq(GroupMember.userId, input.userId),
  //         ),
  //       );
  //   }),

  // search: publicProcedure
  // 	.input(z.object({ query: z.string() }))
  // 	.query(({ ctx, input }) => {
  // 		return ctx.db.query.Group.findMany({
  // 			where: {
  // 				name: {
  // 					contains: input.query,
  // 				},
  // 			},
  // 		});
  // 	}),
} satisfies TRPCRouterRecord;
