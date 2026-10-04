"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { QRCodeSVG } from "qrcode.react";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { ShareMenu } from "@laundryroom/ui/share-menu";
import { toast } from "@laundryroom/ui/toast";

import { authClient } from "~/auth-client";
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
    location: string | null;
    /** e.g. foodiespace.lndry.social, only for groups public on the network */
    atprotoHandle: string | null;
  };
}

function GroupInfo({ group }: GroupInfoProps) {
  const t = useTranslations("group");
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
      {group.location && (
        <div className="mt-2 flex items-center gap-2 text-gray-600">
          <span>📍</span>
          <p className="text-base">{group.location}</p>
        </div>
      )}
      {group.atprotoHandle && (
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-gray-600">
          <span className="lowercase">{t("onTheNetwork")}</span>
          <span className="break-all font-mono">@{group.atprotoHandle}</span>
        </p>
      )}
    </div>
  );
}

interface GroupActionsProps {
  groupId: string;
  group: {
    id: string;
    name: string;
    status: "hidden" | "active" | "archived" | "nsfw" | "private" | null;
  };
  membership?: {
    role: "owner" | "admin" | "member" | "moderator" | "pending";
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
  const t = useTranslations("group");
  // private groups: people ask to join and an owner or admin lets them in
  const isPrivate = group.status === "private";
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
        <LoginCta
          message={isPrivate ? t("logInToAskToJoin") : t("logInToJoin")}
        >
          <Button disabled={isJoining || isRefetching} onClick={onJoin}>
            {isPrivate ? t("askToJoin") : t("join")}
          </Button>
        </LoginCta>
      )}
      {membership?.role === "pending" && (
        <div className="text-black/80">
          {t("requestSent")}{" "}
          <Button
            className="p-1"
            disabled={isLeaving || isRefetching}
            onClick={onLeave}
            variant={"link"}
          >
            {t("withdrawRequest")}
          </Button>
        </div>
      )}
      {membership &&
        membership.role !== "owner" &&
        membership.role !== "pending" && (
          <div className="text-black/80">
            {t("memberOf", { role: membership.role })}{" "}
            <Button
              className="p-1"
              disabled={isLeaving || isRefetching}
              onClick={onLeave}
              variant={"link"}
            >
              {t("leave")}
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
  const t = useTranslations("group");
  const utils = api.useUtils();
  const groupQuery = api.group.byId.useQuery({
    id: props.groupId,
  });
  // logged in meanwhile (e.g. in another tab) while the cached group is still
  // the logged-out stub: fetch it again instead of asking them to log in
  const session = authClient.useSession();
  const isStaleLogIn =
    !!session.data && groupQuery.data?.group?.restriction === "log_in";
  const { refetch } = groupQuery;
  useEffect(() => {
    if (isStaleLogIn) {
      void refetch();
    }
  }, [isStaleLogIn, refetch]);
  const joinGroup = api.group.join.useMutation({
    async onMutate(_variables) {
      await utils.group.myGroups.invalidate();
    },
    onError(error) {
      toast.error(error.message);
    },
  });
  const leaveGroup = api.group.leave.useMutation({
    async onMutate(_variables) {
      await utils.group.myGroups.invalidate();
    },
    onError(error) {
      // e.g. an owner trying to leave before transferring ownership
      toast.error(error.message);
    },
  });

  if (groupQuery.error) {
    return <div>Failed to load group</div>;
  }
  if (groupQuery.isLoading || !groupQuery.data) {
    return <div className="flex flex-col">Loading group...</div>;
  }
  const { membership, group, promotion } = groupQuery.data;

  // missing, or archived and the viewer is not a member
  if (!group) {
    return (
      <Box className="mx-auto w-full max-w-2xl text-black">{t("notFound")}</Box>
    );
  }
  // private and nsfw groups only send a stub when the viewer may not see them
  if (group.restriction !== null) {
    return (
      <Box className="mx-auto w-full max-w-2xl text-black">
        {group.restriction === "log_in" ? (
          <LoginCta message={t("logInToSee")}>
            <p>
              {groupQuery.isFetching ? "Loading group..." : t("logInToSee")}
            </p>
          </LoginCta>
        ) : (
          <p>
            {t("nsfwHint")}{" "}
            <Link
              href="/edit-profile"
              className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
            >
              {t("nsfwLink")}
            </Link>
          </p>
        )}
      </Box>
    );
  }

  const shortCode = group.shortCodes[0]?.code;
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
            try {
              await joinGroup.mutateAsync({ groupId: group.id });
            } catch {
              // the error toast is shown by the mutation
              return;
            }
            const { data } = await groupQuery.refetch();
            // join succeeds silently for banned users (the api must not reveal
            // the ban), so the only signal is that there is still no membership.
            // in private groups a ban looks like a request that stays pending
            if (data && !data.membership) {
              toast.error(t("cannotJoin"));
            }
          }}
          onLeave={async () => {
            try {
              await leaveGroup.mutateAsync({ groupId: group.id });
            } catch {
              // the error toast is shown by the mutation
              return;
            }
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
