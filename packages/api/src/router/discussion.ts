import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq } from "@laundryroom/db";
import { Discussion, UpsertDiscussionSchema } from "@laundryroom/db/schema";

import { protectedProcedure, publicProcedure } from "../trpc";

export const discussionRouter = {
  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => {
      // TODO check that user is member of the group
      return ctx.db.query.Discussion.findFirst({
        where: eq(Discussion.id, input.id),
        columns: { id: true, title: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
          // comments: {
          //   columns: { id: true, content: true, createdAt: true },
          //   with: {
          //     user: {
          //       columns: { id: true, name: true, image: true },
          //     },
          //   },
          // },
        },
      });
    }),

  create: protectedProcedure
    .input(UpsertDiscussionSchema)
    .mutation(({ ctx, input }) => {
      const userId = ctx.session.user.id;
      return ctx.db.insert(Discussion).values({ ...input, userId });
    }),

  // delete: protectedProcedure.input(z.string()).mutation(({ ctx, input }) => {
  //   return ctx.db.delete(Post).where(eq(Post.id, input));
  // }),

  byGroupId: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.query.Discussion.findMany({
        where: eq(Discussion.groupId, input.groupId),
        columns: { id: true, title: true, content: true, createdAt: true },
        with: {
          user: {
            columns: { id: true, name: true, image: true },
          },
        },
      });
    }),
} satisfies TRPCRouterRecord;
