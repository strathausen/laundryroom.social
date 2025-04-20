import { createTRPCRouter } from "../trpc";

import { groupRouter } from "./group";
import { utilsRouter } from "./utils";

export const appRouter = createTRPCRouter({
  group: groupRouter,
  utils: utilsRouter,
});

export type AppRouter = typeof appRouter;
