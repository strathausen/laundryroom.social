"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { LoginCta } from "~/app/_components/login-cta";
import { MembersWidget } from "~/app/_components/members-widget";
import { api } from "~/trpc/react";

export default function MembersList() {
  const t = useTranslations("group");
  const { groupId } = useParams<{ groupId: string }>();
  const groupQuery = api.group.byId.useQuery({ id: groupId });
  // members only: no bans, no open join requests
  const isMember = !!groupQuery.data?.canSeeMemberContent;

  let content: React.ReactNode;
  if (groupQuery.isLoading) {
    content = <p>loading members...</p>;
  } else if (isMember) {
    content = <MembersWidget groupId={groupId} />;
  } else if (groupQuery.data?.membership?.role === "pending") {
    content = <p>{t("pendingContent")}</p>;
  } else if (groupQuery.data?.group?.status === "private") {
    content = <p>{t("privateContent")}</p>;
  } else {
    content = <p>{t("joinToSeeMembers")}</p>;
  }

  return <LoginCta message="log in to see members">{content}</LoginCta>;
}
