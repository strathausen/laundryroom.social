import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { publicProcedure } from "../trpc";

export const utilsRouter = {
  test: publicProcedure.query(() => {
    return {
      test: "test",
    };
  }),
} satisfies TRPCRouterRecord;
