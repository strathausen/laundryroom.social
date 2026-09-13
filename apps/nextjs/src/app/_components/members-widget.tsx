"use client";

import { useState } from "react";

import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { api } from "~/trpc/react";
import { UserModerator } from "./user-moderator";

interface MembersModerationProps {
  groupId: string;
}

export function MembersWidget(props: MembersModerationProps) {
  const [search, setSearch] = useState("");
  const [showBanned, setShowBanned] = useState(false);
  const fetchMembers = api.group.members.useQuery({
    groupId: props.groupId,
    search,
  });

  if (fetchMembers.error) {
    return <div>Error: {fetchMembers.error.message}</div>;
  }

  const viewerRole = fetchMembers.data?.role;
  const viewerUserId = fetchMembers.data?.userId;
  const isAdmin = ["owner", "admin"].includes(viewerRole ?? "");
  const isOwner = viewerRole === "owner";
  const members = fetchMembers.data?.members ?? [];
  // non-admins never receive banned rows from the api, this is just for admins
  const activeMembers = members.filter((u) => u.role !== "banned");
  const bannedMembers = members.filter((u) => u.role === "banned");

  const renderMember = ({
    userId,
    userName,
    role,
  }: (typeof members)[number]) => (
    // key on the role too, so a row remounts (and drops its local state) when
    // the role changes server-side, e.g. after an ownership transfer
    <li key={`${userId}-${role}`}>
      <UserModerator
        userName={userName}
        userId={userId}
        userRole={role}
        groupId={props.groupId}
        // mirror the server rules: the owner's role never changes here, and an
        // admin cannot change another admin's role (but may step down)
        enableRoleChange={
          isAdmin &&
          role !== "owner" &&
          (isOwner || role !== "admin" || userId === viewerUserId)
        }
        enableOwnershipTransfer={isOwner && role !== "owner"}
        isSelf={userId === viewerUserId}
      />
    </li>
  );

  return (
    <div className="mx-auto flex min-w-96 max-w-lg flex-col gap-4">
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members"
      />
      <ul className="flex flex-col gap-2">{activeMembers.map(renderMember)}</ul>
      {isAdmin && bannedMembers.length > 0 && (
        <Button
          onClick={() => setShowBanned(!showBanned)}
          variant="link"
          className=""
        >
          {showBanned ? "hide banned users" : "show banned users"}
        </Button>
      )}
      {isAdmin && showBanned && (
        <ul className="flex flex-col gap-2">
          {bannedMembers.map(renderMember)}
        </ul>
      )}
    </div>
  );
}
