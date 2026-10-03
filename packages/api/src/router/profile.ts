import { z } from "zod";

import { eq } from "@laundryroom/db";
import { User } from "@laundryroom/db/schema";

import { publicProcedure } from "../trpc";

export const profileRouter = {
  getPublicProfile: publicProcedure
    .input(
      z.object({
        userId: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const profile = ctx.db.query.User.findFirst({
        where: eq(User.id, input.userId),
        columns: {
          name: true,
          image: true,
          bio: true,
          pronouns: true,
          links: true,
          // the connected atproto handle: public on the network anyway, and
          // the profile shows it to everyone (the connect form says so)
          handle: true,
        },
      });
      return profile;
    }),
};
