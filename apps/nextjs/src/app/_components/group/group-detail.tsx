"use client";

import Image from "next/image";
import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

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
      {/* <h2 className="border-b-2 border-black text-2xl uppercase">
        {group.name}
      </h2> */}
      <Box className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {group.image && (
          <Image
            src={group.image}
            alt={group.name}
            width={800}
            height={400}
            className="w-full object-cover"
            style={{ imageRendering: "pixelated" }}
          />
        )}
        <h2 className="mt-4 text-xl uppercase">{group.name}</h2>
        {/* the MDXRemote component can only run server side, need to figur this out */}
        {/* <MDXRemote source={groupQuery.data.description} /> */}
        {group.description.split("\n").map((line, i) => (
          <p className="text-base" key={i}>
            {line}
          </p>
        ))}
        <div className="flex items-end justify-between print:hidden">
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

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
            </Button>
            <ShareMenu
              url={document.baseURI}
              title={groupQuery.data.group.name}
            />
          </div>
        </div>
        <div className="mt-8 hidden print:block">
          <div className="flex items-end gap-4">
            <QRCodeSVG value={document.baseURI} size={200} level="H" />
            <div className="-mb-32 -mr-9 flex gap-1">
              {[...Array(8)].map((_, i) => (
                <div
                  key={`cutout-${i}`}
                  className="flex flex-col border-r-2 border-dashed border-black py-1 pr-2 [writing-mode:tb]"
                >
                  <div className="text-center text-sm">{group.name}</div>
                  <div className="text-center text-xs">
                    {document.baseURI.slice(0, 30)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Box>
    </div>
  );
}
