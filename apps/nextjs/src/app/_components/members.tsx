"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

interface MembersModerationProps {
  groupId: string;
}

export function MembersWidget(props: MembersModerationProps) {
  const [search, setSearch] = useState("");
  const fetchMembers = api.group.members.useQuery({
    groupId: props.groupId,
    search,
  });

  if (fetchMembers.error) {
    return <div>Error: {fetchMembers.error.message}</div>;
  }
  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members"
      />
      <ul>
        {fetchMembers.data?.members.map(({ userId, userName, role }) => (
          <li key={userId}>
            {userName} ({role})
          </li>
        ))}
      </ul>
    </div>
  );
}
