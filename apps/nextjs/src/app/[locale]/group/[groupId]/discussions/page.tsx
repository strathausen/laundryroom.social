"use client";

import { useParams } from "next/navigation";

import { DiscussionWidget } from "~/app/_components/discussions";
import { LoginCta } from "~/app/_components/login-cta";
import { api } from "~/trpc/react";

export default function MeetupsPage() {
  const params = useParams<{ groupId: string }>();
  const { data: group } = api.group.byId.useQuery({
    id: params.groupId,
  });

  const membership = group?.membership;

  return (
    <main className="m-auto my-16 min-h-screen max-w-screen-sm text-black">
      <LoginCta message="log in to join the discussion">
        {membership ? (
          <DiscussionWidget groupId={params.groupId} />
        ) : (
          <p>join this group to participate in the discussion</p>
        )}
      </LoginCta>
    </main>
  );
}
