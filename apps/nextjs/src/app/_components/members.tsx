"use client";

import { useState } from "react";

import { Input } from "@laundryroom/ui/input";

import { api } from "~/trpc/react";
import { UserModerator } from "./user-moderator";

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
    <div className="mx-auto flex min-w-96 max-w-lg flex-col gap-4">
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members"
      />
      <ul className="flex flex-col gap-2">
        {fetchMembers.data?.members.map(({ userId, userName, role }) => (
          <li key={userId}>
            <UserModerator
              userName={userName}
              userId={userId}
              userRole={role}
              groupId={props.groupId}
              enableRoleChange={
                role !== "owner" &&
                ["owner", "admin"].includes(fetchMembers.data.role)
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
