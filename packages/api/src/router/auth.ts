import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { auth } from "@laundryroom/auth";
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
  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    // revokes the session row and expires the cookie (via the nextCookies plugin)
    await auth.api.signOut({ headers: ctx.headers });
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
    // allow-list the editable columns: the insert schema also carries id and
    // createdAt, which must not be settable by the user
    .input(
      UpdateProfileSchema.pick({
        name: true,
        pronouns: true,
        links: true,
        bio: true,
        image: true,
      }),
    )
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

    await ctx.db.delete(User).where(eq(User.id, userId));
    // the session rows are gone by cascade, but the browser still holds the
    // session cookies (and the signed cookie cache, good for 5 minutes without
    // a db lookup); sign-out expires them even when the row no longer exists
    await auth.api.signOut({ headers: ctx.headers });
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
