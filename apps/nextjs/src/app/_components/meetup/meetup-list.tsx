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
}

export function MeetupList({ groupId, canEdit }: Props) {
  const meetups = useMeetups({ groupId });
  const [editableEventId, setEditableEventId] = useState<string | undefined>();
  const [showCreateMeetup, setShowCreateMeetup] = useState(false);

  return (
    <div>
      <h2 className="border-b-2 border-black text-2xl uppercase">
        upcoming meetups
      </h2>
      {meetups.hasNextPage && (
        <div className="mt-4 flex flex-col">
          <Button onClick={() => meetups.fetchNextPage()} variant={"ghost"}>
            load future
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-3">
        {meetups.items.map((meetup) => (
          <MeetupCard
            key={meetup.id}
            meetup={meetup}
            canEdit={canEdit}
            onEdit={() => {
              setEditableEventId(meetup.id);
              setShowCreateMeetup(true);
            }}
          />
        ))}
        {!meetups.items.length && <p>no upcoming meetups</p>}
      </div>
      {meetups.hasPreviousPage && (
        <div className="mt-4 flex flex-col">
          <Button onClick={() => meetups.fetchPreviousPage()} variant={"ghost"}>
            load past
          </Button>
        </div>
      )}
      <div className="mt-4 flex justify-around">
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
              groupId={groupId}
              eventId={editableEventId}
              onSaved={() => {
                setShowCreateMeetup(false);
                setEditableEventId(undefined);
                // await listMeetups.refetch();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
