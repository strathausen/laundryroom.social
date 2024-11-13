import { z } from "zod";

import { and, eq } from "@laundryroom/db";
import { Group, GroupMember, GroupPromotion } from "@laundryroom/db/schema";
import { sendEmail } from "@laundryroom/email";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const promotionRouter = createTRPCRouter({
  /**
   * Ask for promotion of a group you are the owner of
   * The platform owner will review the request and decide whether to promote the group
   */
  askForIt: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        message: z.string(),
        status: z.enum(["not_interested", "pending"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx.session;
      // is the user the owner of the group?
      const group = await ctx.db.query.Group.findFirst({
        where: eq(Group.id, input.groupId),
      });
      if (!group) {
        throw new Error("Group not found");
      }
      const membership = await ctx.db.query.GroupMember.findFirst({
        where: and(
          eq(GroupMember.userId, user.id),
          eq(GroupMember.groupId, input.groupId),
          eq(GroupMember.role, "owner"),
        ),
      });
      if (!membership) {
        throw new Error("You are not the owner of this group");
      }
      // get the current promotion status
      const promotion = await ctx.db.query.GroupPromotion.findFirst({
        where: and(
          eq(GroupPromotion.groupId, input.groupId),
          eq(GroupPromotion.promotionStatus, "promotable"),
        ),
      });
      if (!promotion) {
        throw new Error("Group promotion not found");
      }
      // update the promotion status
      await ctx.db
        .update(GroupPromotion)
        .set({
          promotionStatus: input.status,
          message: input.message,
        })
        .where(eq(GroupPromotion.id, promotion.id));
      await sendEmail("strathausen@pm.me", "promotionStatusChange", {
        group,
        user: { ...user, email: user.email ?? "no-email" },
        status: input.status,
        message: input.message,
      });
      return true;
    }),
});
