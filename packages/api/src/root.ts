import { authRouter } from "./router/auth";
import { groupRouter } from "./router/group";
import { meetupRouter } from "./router/meetup";
import { postRouter } from "./router/post";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  group: groupRouter,
  meetup: meetupRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
