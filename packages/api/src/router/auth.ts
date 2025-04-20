import type { TRPCRouterRecord } from "@trpc/server";

import { invalidateSessionToken } from "@laundryroom/auth";
import { eq } from "@laundryroom/db";
import { UpdateProfileSchema, User } from "@laundryroom/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

const protocolRegex = /^https?:\/\//;

export const authRouter = {
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),
  getSecretMessage: protectedProcedure.query(() => {
    return "you can see this secret message!";
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
  deleteMe: protectedProcedure.mutation(({ ctx }) => {
    return ctx.db.delete(User).where(eq(User.id, ctx.session.user.id));
  }),
} satisfies TRPCRouterRecord;
