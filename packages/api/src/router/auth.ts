import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { invalidateSessionToken } from "@laundryroom/auth";
import { and, eq } from "@laundryroom/db";
import {
  Group,
  GroupMember,
  UpdateProfileSchema,
  User,
  UserFlags,
} from "@laundryroom/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

const protocolRegex = /^https?:\/\//;

export const authRouter = {
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  signOut: protectedProcedure.mutation(async (opts) => {
    if (!opts.ctx.token) {
      return { success: false };
    }
    await invalidateSessionToken(opts.ctx.token);
    return { success: true };
  }),
  getProfile: protectedProcedure.query(({ ctx }) => {
    return ctx.db.query.User.findFirst({
      where: eq(User.id, ctx.session.user.id),
      columns: {
        name: true,
        image: true,
        bio: true,
        email: true,
        pronouns: true,
        links: true,
        flags: true,
      },
    });
  }),
  updateProfile: protectedProcedure
    .input(UpdateProfileSchema)
    .mutation(({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Ensure links have a protocol
      if (input.links) {
        input.links = input.links
          .map((link) => link.trim())
          .filter((link) => link.length > 0)
          .map((link) => {
            if (!protocolRegex.exec(link)) {
              return `https://${link}`;
            }
            return link;
          });
      }
      return ctx.db.update(User).set(input).where(eq(User.id, userId));
    }),
  setFlag: protectedProcedure
    .input(
      z.object({
        flag: z.enum(UserFlags.enumValues),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.query.User.findFirst({
        where: eq(User.id, ctx.session.user.id),
        columns: { flags: true },
      });
      if (!user) {
        throw new Error("User not found");
      }
      const newFlags = input.enabled
        ? [...(user.flags ?? []), input.flag]
        : (user.flags?.filter((flag) => flag !== input.flag) ?? []);
      return ctx.db
        .update(User)
        .set({ flags: newFlags })
        .where(eq(User.id, ctx.session.user.id));
    }),
  deleteMe: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // deleting an owner would cascade-delete their membership and leave the
    // group ownerless, so refuse until ownership is transferred
    const ownedGroups = await ctx.db
      .select({ name: Group.name })
      .from(GroupMember)
      .innerJoin(Group, eq(GroupMember.groupId, Group.id))
      .where(
        and(eq(GroupMember.userId, userId), eq(GroupMember.role, "owner")),
      );
    if (ownedGroups.length > 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `transfer ownership or delete these groups first: ${ownedGroups
          .map((group) => group.name)
          .join(", ")}`,
      });
    }

    return ctx.db.delete(User).where(eq(User.id, userId));
  }),
} satisfies TRPCRouterRecord;
