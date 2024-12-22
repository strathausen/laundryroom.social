"use client";

import { useParams } from "next/navigation";

import { MeetupList } from "~/app/_components/meetup/meetup-list";
import { api } from "~/trpc/react";

export default function MeetupsPage() {
  const params = useParams<{ groupId: string }>();
  const { data: group } = api.group.byId.useQuery({
    id: params.groupId,
  });

  const userRole = group?.membership?.role ?? "guest";

  return (
    <main className="m-auto max-w-screen-sm text-black">
      <MeetupList
        groupId={params.groupId}
        canEdit={["admin", "owner"].includes(userRole)}
      />
    </main>
  );
}
