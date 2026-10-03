"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { MeetupList } from "~/app/_components/meetup/meetup-list";
import { api } from "~/trpc/react";

export default function MeetupsPage() {
  const t = useTranslations("group");
  const params = useParams<{ groupId: string }>();
  const { data: group } = api.group.byId.useQuery({
    id: params.groupId,
  });

  const userRole = group?.membership?.role ?? "guest";

  // private and nsfw groups keep their meetups to their members
  if (group && !group.canSeeMeetups) {
    return (
      <main className="m-auto max-w-2xl text-black">
        <p>
          {userRole === "pending"
            ? t("pendingContent")
            : group.group?.status === "private"
              ? t("privateContent")
              : t("joinToSeeMeetups")}
        </p>
      </main>
    );
  }

  return (
    <main className="m-auto max-w-2xl text-black">
      <MeetupList
        groupId={params.groupId}
        canEdit={["admin", "owner"].includes(userRole)}
        isMember={!!group?.canSeeMemberContent}
      />
    </main>
  );
}
