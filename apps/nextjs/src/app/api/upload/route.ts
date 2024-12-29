import type { HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { handleUpload } from "@vercel/blob/client";

import { auth } from "@laundryroom/auth";

// interface ClientPayload {
// }

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const session = await auth();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const payload = JSON.parse(clientPayload ?? "{}"); //as ClientPayload;

        if (!session) {
          throw new Error("Unauthorized");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/gif"],
          tokenPayload: JSON.stringify({ userId: session.user.id, ...payload }),
        };
      },
      onUploadCompleted: async ({ blob: _blob, tokenPayload }) => {
        // Get notified of client upload completion
        // ⚠️ This will not work on `localhost` websites,
        // Use ngrok or similar to get the full upload flow

        // console.log("blob upload completed", blob, tokenPayload);
        if (!tokenPayload) {
          throw new Error("Unauthorized");
        }

        try {
          // Run any logic after the file upload completed
          const { userId } = JSON.parse(tokenPayload) as { userId: string };
          // get the description of the image, generate a new image, upload that to vercel blob, and update the database
          if (!userId) {
            throw new Error("Unauthorized");
          }
        } catch (error) {
          throw new Error(`sry i just could not. ${(error as Error).message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }, // The webhook will retry 5 times waiting for a 200
    );
  }
}
