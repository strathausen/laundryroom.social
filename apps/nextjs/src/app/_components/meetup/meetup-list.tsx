import { useState } from "react";

import { Button } from "@laundryroom/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@laundryroom/ui/dialog";

import { useMeetups } from "~/hooks/use-meetups";
import { MeetupCard } from "./meetup-card";
import { UpsertMeetupForm } from "./meetup-form";

interface Props {
  groupId: string;
  canEdit: boolean;
  /** only (active) members of the group can rsvp */
  isMember: boolean;
}

export function MeetupList({ groupId, canEdit, isMember }: Props) {
  const meetups = useMeetups({ groupId });
  const [editableEventId, setEditableEventId] = useState<string | undefined>();
  const [showCreateMeetup, setShowCreateMeetup] = useState(false);

  return (
    <div>
      <div className="mt-6 flex flex-col gap-6">
        {meetups.items.map((meetup) => (
          <MeetupCard
            key={meetup.id}
            meetup={meetup}
            canEdit={canEdit}
            isMember={isMember}
            onEdit={() => {
              setEditableEventId(meetup.id);
              setShowCreateMeetup(true);
            }}
          />
        ))}
        {!meetups.items.length && <p>no upcoming meetups</p>}
      </div>
      {meetups.hasNextPage && (
        <div className="mt-4 flex flex-col">
          <Button onClick={() => meetups.fetchNextPage()} variant={"ghost"}>
            load past meetups
          </Button>
        </div>
      )}
      {canEdit && (
        <div className="mt-4 flex justify-around">
          <Dialog
            open={showCreateMeetup}
            onOpenChange={(state) => {
              setShowCreateMeetup(state);
              setEditableEventId(undefined);
            }}
          >
            <DialogTrigger asChild>
              <Button>create meetup</Button>
            </DialogTrigger>
            <DialogContent className="uppercase text-black">
              <DialogTitle>
                {editableEventId ? "Edit" : "Create"} Meetup
              </DialogTitle>
              <UpsertMeetupForm
                groupId={groupId}
                meetupId={editableEventId}
                onSaved={() => {
                  setShowCreateMeetup(false);
                  setEditableEventId(undefined);
                  // await listMeetups.refetch();
                }}
                onCancel={() => {
                  setShowCreateMeetup(false);
                  setEditableEventId(undefined);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}
