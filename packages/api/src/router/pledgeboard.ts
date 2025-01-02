import { UpsertPledgeBoardSchema } from "@laundryroom/db/schema";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const pledgeboardRouter = createTRPCRouter({
  upsertPledge: protectedProcedure
    .input(UpsertPledgeBoardSchema)
    .mutation(function async ({ ctx, input }) {
      // const { id, ...data } = input;
      // if (id) {
      //   return ctx.db.pledge.update({
      //     where: { id },
      //     data,
      //   });
      // }
      // return ctx.db.pledge.create({
      //   data,
      // });
    }),
});
