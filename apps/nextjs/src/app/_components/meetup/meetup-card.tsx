import { format } from "date-fns";
import { Pen } from "lucide-react";

import type { RouterOutputs } from "@laundryroom/api";
import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";

import { MembersCount } from "../members-count";
import { RsvpSelect } from "../rsvp-select";

interface Props {
  meetup: RouterOutputs["meetup"]["byGroupId"]["meetups"][number];
  canEdit: boolean;
  onEdit: () => void;
}

export function MeetupCard({ meetup, onEdit, canEdit }: Props) {
  return (
    <Box key={meetup.id} className="flex flex-col justify-between gap-2">
      <div className="flex flex-col space-y-2">
        <div className="flex justify-between align-top">
          <h3 className="text-xl uppercase">{meetup.title}</h3>
          {canEdit && (
            <Button
              onClick={onEdit}
              variant={"ghost"}
              className="relative -right-2 -top-2 p-2 opacity-50 transition-opacity hover:opacity-100"
            >
              <Pen className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="underline decoration-green-400 decoration-4 underline-offset-4">
          {meetup.description}
        </p>
      </div>
      <div className="flex flex-col space-y-2">
        <p>time: {format(new Date(meetup.startTime), "dd MMM yyyy hh:mm a")}</p>
        <div className="flex justify-between gap-4">
          <RsvpSelect meetupId={meetup.id} rsvp={meetup.attendance?.status} />
          <MembersCount count={meetup.attendeesCount} />
        </div>
      </div>
    </Box>
  );
}
