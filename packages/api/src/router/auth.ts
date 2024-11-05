import type { TRPCRouterRecord } from "@trpc/server";

import type { InferInsertModel } from "@laundryroom/db";
import { invalidateSessionToken } from "@laundryroom/auth";
import { eq } from "@laundryroom/db";
import { UpdateProfileSchema, User } from "@laundryroom/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

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
      },
    });
  }),
  updateProfile: protectedProcedure
    .input(UpdateProfileSchema)
    .mutation(({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const updateData: Partial<InferInsertModel<typeof User>> = {};
      if (input.name) {
        updateData.name = input.name;
      }
      if (input.image) {
        updateData.image = input.image;
      }
      if (input.bio) {
        updateData.bio = input.bio;
      }
      return ctx.db.update(User).set(updateData).where(eq(User.id, userId));
    }),
} satisfies TRPCRouterRecord;
