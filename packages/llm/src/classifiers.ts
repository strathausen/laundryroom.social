import { z } from "zod";

import { instructorClient } from "./instructor_client";

enum CLASSIFICATION_LABELS {
  "ok" = "ok",
  "spam" = "spam",
  "offensive" = "offensive",
  "inappropriate" = "inappropriate",
}
const SimpleClassificationSchema = z.object({
  moderationStatus: z.nativeEnum(CLASSIFICATION_LABELS),
  aiSearchText: z
    .string()
    .describe(
      "add some related keywords that are not in the text, to help better find this text in searches",
    ),
});
type SimpleClassification = z.infer<typeof SimpleClassificationSchema>;

const ModerationClassificationSchema = z.object({
  moderationStatus: z.nativeEnum(CLASSIFICATION_LABELS),
});
type ModerationClassification = z.infer<typeof ModerationClassificationSchema>;

export async function classify(data: string): Promise<SimpleClassification> {
  const classification = await instructorClient.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `Classify the following text: <text>${data.replace(/[</>]*/g, "")}</text>`,
      },
    ],
    model: "gpt-4o-mini",
    response_model: {
      schema: SimpleClassificationSchema,
      name: "SimpleClassification",
    },
    max_retries: 3,
  });

  return classification;
}

export async function classifyModeration(
  data: string,
): Promise<ModerationClassification> {
  const classification = await instructorClient.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `
Classify the following text: <text>${data.replace(/[</>]*/g, "")}</text> for moderation.
Be a bit more tolerant than usual, but still remove anything that is clearly inappropriate.
Fuck and shit is fine.
`,
      },
    ],
    model: "gpt-4o-mini",
    response_model: {
      schema: ModerationClassificationSchema,
      name: "ModerationClassification",
    },
    max_retries: 3,
  });

  return classification;
}

export async function classifyModerationModel(input: string) {
  const { results } = await instructorClient.moderations.create({ input });
  return results[0];
}
