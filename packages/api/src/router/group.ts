import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { and, eq } from "@laundryroom/db";
import { Group, GroupMember } from "@laundryroom/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

export const groupRouter = {
  all: publicProcedure.query(({ ctx }) => {
    return ctx.db.query.Group.findMany();
  }),

  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.query.Group.findFirst({
        where: eq(Group.id, input.id),
      });
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

  delete: protectedProcedure.input(z.string()).mutation(({ ctx, input }) => {
    return ctx.db.delete(Group).where(eq(Group.id, input));
  }),

  addMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db.insert(GroupMember).values(input);
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(({ ctx, input }) => {
      return ctx.db
        .delete(GroupMember)
        .where(
          and(
            eq(GroupMember.groupId, input.groupId),
            eq(GroupMember.userId, input.userId),
          ),
        );
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
