import { authRouter } from "./router/auth";
import { discussionRouter } from "./router/discussion";
import { groupRouter } from "./router/group";
import { meetupRouter } from "./router/meetup";
import { promotionRouter } from "./router/promotion";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  discussion: discussionRouter,
  group: groupRouter,
  meetup: meetupRouter,
  promotion: promotionRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
