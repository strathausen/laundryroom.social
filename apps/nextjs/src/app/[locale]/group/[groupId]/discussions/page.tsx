"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { DiscussionWidget } from "~/app/_components/discussions";
import { LoginCta } from "~/app/_components/login-cta";
import { api } from "~/trpc/react";

export default function MeetupsPage() {
  const t = useTranslations("group");
  const params = useParams<{ groupId: string }>();
  const { data: group } = api.group.byId.useQuery({
    id: params.groupId,
  });

  let content: React.ReactNode;
  if (group?.canSeeMemberContent) {
    content = <DiscussionWidget groupId={params.groupId} />;
  } else if (group?.membership?.role === "pending") {
    content = <p>{t("pendingContent")}</p>;
  } else if (group?.group?.status === "private") {
    content = <p>{t("privateContent")}</p>;
  } else {
    content = <p>{t("joinToDiscuss")}</p>;
  }

  return (
    <main className="m-auto my-16 min-h-screen max-w-screen-sm text-black print:min-h-0">
      <LoginCta message="log in to join the discussion">{content}</LoginCta>
    </main>
  );
}
