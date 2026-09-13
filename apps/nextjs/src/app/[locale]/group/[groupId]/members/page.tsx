"use client";

import { useParams } from "next/navigation";

import { LoginCta } from "~/app/_components/login-cta";
import { MembersWidget } from "~/app/_components/members-widget";
import { api } from "~/trpc/react";

export default function MembersList() {
  const { groupId } = useParams<{ groupId: string }>();
  const groupQuery = api.group.byId.useQuery({ id: groupId });
  // byId returns null for anonymous users and undefined for non-members
  const isMember = !!groupQuery.data?.membership;

  let content: React.ReactNode;
  if (groupQuery.isLoading) {
    content = <p>loading members...</p>;
  } else if (isMember) {
    content = <MembersWidget groupId={groupId} />;
  } else {
    content = <p>join this group to get to know the members.</p>;
  }

  return <LoginCta message="log in to see members">{content}</LoginCta>;
}
