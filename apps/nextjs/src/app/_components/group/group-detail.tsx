"use client";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { ShareMenu } from "@laundryroom/ui/share-menu";

import { Link } from "~/i18n/routing";
import { api } from "~/trpc/react";
import { LoginCta } from "../login-cta";
import { GroupPromoter } from "./group-promoter";
import { GroupStatusSwitcher } from "./group-status-switcher";

interface GroupDetailProps {
  groupId: string;
}

export function GroupDetail(props: GroupDetailProps) {
  const utils = api.useUtils();
  const groupQuery = api.group.byId.useQuery({
    id: props.groupId,
  });
  const joinGroup = api.group.join.useMutation({
    async onMutate(_variables) {
      await utils.group.myGroups.invalidate();
    },
  });
  const leaveGroup = api.group.leave.useMutation({
    async onMutate(_variables) {
      await utils.group.myGroups.invalidate();
    },
  });

  if (groupQuery.error) {
    return <div>Failed to load group</div>;
  }
  if (groupQuery.isLoading || !groupQuery.data?.group) {
    return <div className="flex flex-col">Loading group...</div>;
  }
  const { membership, group, promotion } = groupQuery.data;

  return (
    <div className="flex flex-col gap-5 text-black">
      <h2 className="border-b-2 border-black text-2xl uppercase">
        {group.name}
      </h2>
      <Box className="mx-auto w-full max-w-2xl">
        <h2 className="mb-2 text-xl uppercase">about this group</h2>
        {/* the MDXRemote component can only run server side, need to figur this out */}
        {/* <MDXRemote source={groupQuery.data.description} /> */}
        {group.description.split("\n").map((line, i) => (
          <p className="text-base" key={i}>
            {line}
          </p>
        ))}
        <div className="flex items-end justify-end">
          <ShareMenu
            url={document.baseURI}
            title={groupQuery.data.group.name}
          />
        </div>
      </Box>
      <div className="flec-col flex justify-center">
        {/* show edit button if I'm the owner */}
        {membership?.role === "owner" && (
          <div className="flex gap-4">
            <Link href={`/edit-group/${groupQuery.data.group.id}`}>
              <Button>edit</Button>
            </Link>

            <GroupStatusSwitcher
              groupId={props.groupId}
              status={group.status}
            />
            {promotion && (
              <GroupPromoter
                groupId={props.groupId}
                onDone={() => groupQuery.refetch()}
              />
            )}
          </div>
        )}
        {/* show join button if no membership */}
        {!membership && (
          <LoginCta message="log in to join this group">
            <Button
              disabled={joinGroup.isPending || groupQuery.isRefetching}
              onClick={async () => {
                await joinGroup.mutateAsync({ groupId: group.id });
                await groupQuery.refetch();
              }}
            >
              join this group
            </Button>
          </LoginCta>
        )}
        {/* if user is not the owner and is a member, offer to leave the group */}
        {membership && membership.role !== "owner" && (
          <div className="text-black/80">
            you're a{membership.role === "admin" ? "n admin" : " member"} of
            this group,{" "}
            <Button
              className="p-1"
              disabled={leaveGroup.isPending || groupQuery.isRefetching}
              onClick={async () => {
                if (!groupQuery.data.group) return;
                await leaveGroup.mutateAsync({
                  groupId: groupQuery.data.group.id,
                });
                await groupQuery.refetch();
              }}
              variant={"link"}
            >
              leave this group
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
