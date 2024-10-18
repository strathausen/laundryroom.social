"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

interface MembersModerationProps {
  groupId: string;
}

export function MembersModeration(props: MembersModerationProps) {
	const [search, setSearch] = useState("");
  const fetchMembers = api.group.members.useQuery({ groupId: props.groupId, search });

  if (fetchMembers.error) {
    return <div>Error: {fetchMembers.error.message}</div>;
  }
  return (
    <div>
      <h2>Members</h2>
			<input
				type="text"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				placeholder="Search members"
			/>
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
