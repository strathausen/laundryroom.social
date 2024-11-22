"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@laundryroom/ui/dialog";
import { ShareMenu } from "@laundryroom/ui/share-menu";

import { api } from "~/trpc/react";
import { DiscussionWidget } from "../discussions";
import { GroupPromoter } from "../group/group-promoter";
import { LoginCta } from "../login-cta";
import { MeetupCard } from "../meetup/meetup-card";
import { UpsertMeetupForm } from "../meetup/meetup-form";
import { MembersWidget } from "../members-widget";
import { GroupStatusSwitcher } from "./group-status-switcher";

export function GroupDetail() {
  const params = useParams<{ groupId: string }>();
  const [showCreateMeetup, setShowCreateMeetup] = useState(false);
  const [editableEventId, setEditableEventId] = useState<string | undefined>();
  const utils = api.useUtils();
  const groupQuery = api.group.byId.useQuery({
    id: params.groupId,
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
  const listMeetups = api.meetup.byGroupId.useQuery({
    groupId: params.groupId,
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
            <Dialog
              open={showCreateMeetup}
              onOpenChange={(state) => {
                setShowCreateMeetup(state);
                setEditableEventId(undefined);
              }}
            >
              <DialogTrigger asChild>
                <Button>create event</Button>
              </DialogTrigger>
              <DialogContent className="uppercase text-black">
                <DialogTitle>
                  {editableEventId ? "Edit" : "Create"} Event
                </DialogTitle>
                <UpsertMeetupForm
                  groupId={params.groupId}
                  eventId={editableEventId}
                  onSaved={async () => {
                    setShowCreateMeetup(false);
                    setEditableEventId(undefined);
                    await listMeetups.refetch();
                  }}
                />
              </DialogContent>
            </Dialog>
            <GroupStatusSwitcher
              groupId={params.groupId}
              status={group.status}
            />
            {promotion && (
              <GroupPromoter
                groupId={params.groupId}
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
            you're a member of this group,{" "}
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
      {/* show events, discussions, etc */}
      <div className="my-8">
        <h2 className="border-b-2 border-black text-2xl uppercase">
          upcoming meetups
        </h2>
        <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3">
          {listMeetups.data?.map((meetup) => (
            <MeetupCard
              key={meetup.id}
              meetup={meetup}
              canEdit={membership?.role === "owner"}
              onEdit={() => {
                setEditableEventId(meetup.id);
                setShowCreateMeetup(true);
              }}
            />
          ))}
          {!listMeetups.data?.length && <p>no upcoming meetups</p>}
        </div>
      </div>
      <h2 className="border-b-2 border-black text-2xl uppercase">talk</h2>
      <LoginCta message="log in to join the discussion">
        {membership ? (
          <DiscussionWidget groupId={params.groupId} />
        ) : (
          <p>join this group to participate in the discussion</p>
        )}
      </LoginCta>
      <h2 className="border-b-2 border-black text-2xl uppercase">members</h2>
      <LoginCta message="log in to see members">
        {membership ? (
          <MembersWidget groupId={params.groupId} />
        ) : (
          <p>join this group to get to know the members.</p>
        )}
      </LoginCta>
      <br className="mb-12" />
    </div>
  );
}
