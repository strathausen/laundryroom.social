import { authRouter } from "./router/auth";
import { groupRouter } from "./router/group";
import { postRouter } from "./router/post";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  group: groupRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
