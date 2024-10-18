"use client";

import { api } from "~/trpc/react";

interface MembersModerationProps {
  groupId: string;
}

export function MembersModeration(props: MembersModerationProps) {
  const fetchMembers = api.group.members.useQuery({ groupId: props.groupId });

  if (fetchMembers.error) {
    return <div>Error: {fetchMembers.error.message}</div>;
  }
  return (
    <div>
      <h2>Members</h2>
      <ul>
        {fetchMembers.data?.map(({ user, ...member }) => (
          <li key={user.id}>
            {user.name} ({member.role}
          </li>
        ))}
      </ul>
    </div>
  );
}
