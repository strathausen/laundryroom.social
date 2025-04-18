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

interface GroupInfoProps {
  group: {
    name: string;
    image: string | null;
    description: string;
  };
}

function GroupInfo({ group }: GroupInfoProps) {
  return (
    <div className="flex flex-col gap-2">
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
      {group.description.split("\n").map((line, i) => (
        <p className="text-base" key={i}>
          {line}
        </p>
      ))}
    </div>
  );
}

interface GroupActionsProps {
  groupId: string;
  group: {
    id: string;
    name: string;
    status: "hidden" | "active" | "archived" | null;
  };
  membership?: {
    role: "owner" | "admin" | "member" | "moderator" | "banned";
  } | null;
  promotion?: { id: string } | null;
  onJoin: () => Promise<void>;
  onLeave: () => Promise<void>;
  isJoining: boolean;
  isLeaving: boolean;
  isRefetching: boolean;
  onRefetch: () => Promise<unknown>;
  shortUrl: string;
}

function GroupActions({
  groupId,
  group,
  membership,
  promotion,
  onJoin,
  onLeave,
  isJoining,
  isLeaving,
  isRefetching,
  onRefetch,
  shortUrl,
}: GroupActionsProps) {
  return (
    <div className="flex items-center justify-between print:hidden">
      {membership?.role === "owner" && (
        <div className="flex gap-4">
          <Link href={`/edit-group/${group.id}`}>
            <Button>edit</Button>
          </Link>

          <GroupStatusSwitcher groupId={groupId} status={group.status} />
          {promotion && <GroupPromoter groupId={groupId} onDone={onRefetch} />}
        </div>
      )}
      {!membership && (
        <LoginCta message="log in to join this group">
          <Button disabled={isJoining || isRefetching} onClick={onJoin}>
            join this group
          </Button>
        </LoginCta>
      )}
      {membership && membership.role !== "owner" && (
        <div className="text-black/80">
          you're a{membership.role === "admin" ? "n admin" : " member"} of this
          group,{" "}
          <Button
            className="p-1"
            disabled={isLeaving || isRefetching}
            onClick={onLeave}
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
        <ShareMenu url={shortUrl} title={group.name} />
      </div>
    </div>
  );
}

interface GroupPrintSectionProps {
  groupName: string;
  shortUrl: string;
}

function GroupPrintSection({ groupName, shortUrl }: GroupPrintSectionProps) {
  return (
    <div className="mt-8 hidden print:block">
      <div className="flex items-end gap-4">
        <QRCodeSVG value={shortUrl} size={200} level="H" />
        <div className="-mr-9 flex">
          {[...Array<undefined>(8)].map((_, i) => (
            <div
              key={`cutout-${i}`}
              className="flex flex-col border-l-2 border-dashed border-black px-1.5 py-2 [writing-mode:tb]"
            >
              <div className="text-center text-sm">{groupName}</div>
              <div className="text-center text-xs">{shortUrl}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

  const shortCode = groupQuery.data.group.shortCodes[0]?.code;
  const shortUrl = shortCode
    ? `${window.location.origin}/g/${shortCode}`
    : document.baseURI;

  return (
    <div className="flex flex-col gap-5 text-black">
      <Box className="mx-auto flex w-full max-w-2xl flex-col gap-4 print:min-h-[95vh] print:justify-between">
        <GroupInfo group={group} />
        <GroupActions
          groupId={props.groupId}
          group={group}
          membership={membership}
          promotion={promotion}
          onJoin={async () => {
            await joinGroup.mutateAsync({ groupId: group.id });
            await groupQuery.refetch();
          }}
          onLeave={async () => {
            if (!groupQuery.data.group) return;
            await leaveGroup.mutateAsync({
              groupId: groupQuery.data.group.id,
            });
            await groupQuery.refetch();
          }}
          isJoining={joinGroup.isPending}
          isLeaving={leaveGroup.isPending}
          isRefetching={groupQuery.isRefetching}
          onRefetch={async () => {
            await groupQuery.refetch();
          }}
          shortUrl={shortUrl}
        />
        <GroupPrintSection groupName={group.name} shortUrl={shortUrl} />
      </Box>
    </div>
  );
}
