import Instructor from "@instructor-ai/instructor";
import OpenAI from "openai";

const oai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? undefined,
  organization: process.env.OPENAI_ORG_ID ?? undefined,
  project: process.env.OPENAI_PROJECT_ID ?? undefined,
});
export const instructorClient = Instructor({
  client: oai,
  mode: "FUNCTIONS",
});
