"use client";

import { useParams } from "next/navigation";

import { LoginCta } from "~/app/_components/login-cta";
import { MembersWidget } from "~/app/_components/members-widget";
import { api } from "~/trpc/react";

export default function MembersList() {
  const { groupId } = useParams<{ groupId: string }>();
  const groupQuery = api.group.byId.useQuery({ id: groupId });
  const isMember = groupQuery.data?.membership !== null;
  return (
    <LoginCta message="log in to see members">
      {isMember ? (
        <MembersWidget groupId={groupId} />
      ) : (
        <p>join this group to get to know the members.</p>
      )}
    </LoginCta>
  );
}
