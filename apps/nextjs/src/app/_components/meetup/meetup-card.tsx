import { format } from "date-fns";
import { Pen } from "lucide-react";
import { useSession } from "next-auth/react";

import type { RouterOutputs } from "@laundryroom/api";
import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";

import { Link } from "~/i18n/routing";
import { MembersCount } from "../members-count";
import { RsvpSelect } from "../rsvp-select";

interface Props {
  meetup: RouterOutputs["meetup"]["byGroupId"]["meetups"][number];
  canEdit: boolean;
  onEdit: () => void;
}

export function MeetupCard({ meetup, onEdit, canEdit }: Props) {
  const isCancelled = meetup.status === "cancelled";
  const isPast = new Date(meetup.startTime) < new Date();
  const session = useSession();

  return (
    <Box
      key={meetup.id}
      className={`relative flex flex-col justify-between gap-5 ${meetup.status === "hidden" ? "opacity-50" : ""}`}
    >
      {isCancelled && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rotate-[-15deg] transform border-4 border-black bg-hotpink px-6 py-2 text-4xl font-bold uppercase text-white shadow-[4px_4px_0px_0px_#000000]">
            Cancelled
          </div>
        </div>
      )}
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
        {session.data ? (
          <Link href={`/meetup/${meetup.id}`}>
            <p className="underline decoration-green-400 decoration-4 underline-offset-4">
              {meetup.description}
            </p>
          </Link>
        ) : (
          <p>{meetup.description}</p>
        )}
      </div>
      <div className="flex flex-col gap-2 space-y-2">
        <div>
          📅{" "}
          <strong>
            {format(new Date(meetup.startTime), "dd MMM yyyy hh:mm a")}
          </strong>
        </div>
        {meetup.location && (
          <div>
            📍 <strong>{meetup.location}</strong>
          </div>
        )}
        <div className="flex justify-between">
          <RsvpSelect
            meetupId={meetup.id}
            groupId={meetup.groupId}
            rsvp={meetup.attendance?.status}
            disabled={isCancelled || isPast || !session.data}
          />
          <MembersCount count={meetup.attendeesCount} />
        </div>
      </div>
    </Box>
  );
}
