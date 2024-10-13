import { authRouter } from "./router/auth";
import { groupRouter } from "./router/group";
import { meetupRouter } from "./router/meetup";
import { discussionRouter } from "./router/discussion";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  discussion: discussionRouter,
  group: groupRouter,
  meetup: meetupRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
