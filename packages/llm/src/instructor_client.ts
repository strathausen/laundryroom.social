import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";

const createInstructorClient = () =>
  Instructor({
    client: new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? undefined,
      organization: process.env.OPENAI_ORG_ID ?? undefined,
      project: process.env.OPENAI_PROJECT_ID ?? undefined,
    }),
    mode: "FUNCTIONS",
  });

let instructorClient: ReturnType<typeof createInstructorClient> | undefined;

/**
 * Created on first use rather than at import time: `openai` throws when the
 * api key is undefined, and `next build` evaluates every route module that
 * (transitively) imports this package while it collects page data, where no
 * key exists (the docker image is built with SKIP_ENV_VALIDATION=1).
 */
export const getInstructorClient = () =>
  (instructorClient ??= createInstructorClient());
