"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";
import { UserModerator } from "./user-moderator";

interface MembersModerationProps {
  groupId: string;
}

export function MembersWidget(props: MembersModerationProps) {
  const t = useTranslations("members");
  const [search, setSearch] = useState("");
  const [showBanned, setShowBanned] = useState(false);
  const utils = api.useUtils();
  const fetchMembers = api.group.members.useQuery({
    groupId: props.groupId,
    search,
  });
  // join requests (private groups): approve makes them a member, decline
  // deletes the request, ban keeps it "sent" forever without notifying again
  const answerRequest = api.group.changeRole.useMutation({
    async onSuccess(_data, { role }) {
      toast.success(role === "banned" ? t("requestBanned") : t("approved"));
      await utils.group.members.invalidate();
    },
    onError(error) {
      toast.error(error.message);
    },
  });
  const declineRequest = api.group.removeMember.useMutation({
    async onSuccess() {
      toast.success(t("declined"));
      await utils.group.members.invalidate();
    },
    onError(error) {
      toast.error(error.message);
    },
  });
  const isAnswering = answerRequest.isPending || declineRequest.isPending;

  if (fetchMembers.error) {
    return <div>Error: {fetchMembers.error.message}</div>;
  }

  const viewerRole = fetchMembers.data?.role;
  const viewerUserId = fetchMembers.data?.userId;
  const isAdmin = ["owner", "admin"].includes(viewerRole ?? "");
  const isOwner = viewerRole === "owner";
  const members = fetchMembers.data?.members ?? [];
  // only the owner and admins receive join requests from the api
  const requests = fetchMembers.data?.requests ?? [];
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
      {isAdmin && requests.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">{t("requests")}</h3>
          <ul className="flex flex-col gap-2">
            {requests.map((request) => (
              <li
                key={request.userId}
                className="flex items-center justify-between gap-2 border-2 border-black bg-white p-2"
              >
                {request.userName || "anonymous"}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={isAnswering}
                    onClick={() =>
                      answerRequest.mutate({
                        groupId: props.groupId,
                        userId: request.userId,
                        role: "member",
                      })
                    }
                  >
                    {t("approve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isAnswering}
                    onClick={() =>
                      declineRequest.mutate({
                        groupId: props.groupId,
                        userId: request.userId,
                      })
                    }
                  >
                    {t("decline")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isAnswering}
                    onClick={() =>
                      answerRequest.mutate({
                        groupId: props.groupId,
                        userId: request.userId,
                        role: "banned",
                      })
                    }
                  >
                    {t("ban")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
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
