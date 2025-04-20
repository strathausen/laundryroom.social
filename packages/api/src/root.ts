import { authRouter } from "./router/auth";
import { commentRouter } from "./router/comment";
import { discussionRouter } from "./router/discussion";
import { groupRouter } from "./router/group";
import { meetupRouter } from "./router/meetup";
import { pledgeboardRouter } from "./router/pledgeboard";
import { profileRouter } from "./router/profile";
import { promotionRouter } from "./router/promotion";
import { utilsRouter } from "./router/utils";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  profile: profileRouter,
  comment: commentRouter,
  discussion: discussionRouter,
  group: groupRouter,
  meetup: meetupRouter,
  pledge: pledgeboardRouter,
  promotion: promotionRouter,
  utils: utilsRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
