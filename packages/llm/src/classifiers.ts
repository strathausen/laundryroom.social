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

export async function classify(data: string): Promise<SimpleClassification> {
  const classification = await instructorClient.chat.completions.create({
    messages: [
      {
        role: "user",
        content: `"Classify the following text: <text>${data.replace(/[<\/>]*/g, "")}</text>`,
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
