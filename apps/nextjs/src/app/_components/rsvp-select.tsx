"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@laundryroom/ui/select";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

type RsvpCoice = "going" | "not_going";
type Rsvp = RsvpCoice | "waitlist";

interface Props {
  meetupId: string;
  groupId: string;
  rsvp?: Rsvp | null;
  onChange?: (rsvp: Rsvp) => void;
  disabled?: boolean;
  isFull?: boolean;
}

export function RsvpSelect(props: Props) {
  const rsvpMutation = api.meetup.rsvp.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const utils = api.useUtils();
  const currentRsvp = rsvpMutation.data ?? props.rsvp ?? undefined;
  // people who are already going may keep their spot, everyone else is locked out
  const goingDisabled = !!props.isFull && currentRsvp !== "going";

  return (
    <Select
      // always controlled (an empty string shows the placeholder), so a
      // rejected choice snaps back to the server value instead of sticking
      value={currentRsvp ?? ""}
      onValueChange={async (rsvp: RsvpCoice) => {
        let saved = true;
        try {
          await rsvpMutation.mutateAsync({
            id: props.meetupId,
            status: rsvp,
          });
        } catch {
          // the error is shown as a toast by onError
          saved = false;
        }
        // refresh in both cases: after a rejection (e.g. "this meetup is full")
        // this picks up the isFull / attendee state that caused it
        await utils.meetup.byId.invalidate({ id: props.meetupId });
        await utils.meetup.myAttendance.invalidate({
          meetupId: props.meetupId,
        });
        await utils.meetup.byGroupId.invalidate({ groupId: props.groupId });
        if (saved) {
          props.onChange?.(rsvp);
        }
      }}
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      disabled={props.disabled || rsvpMutation.isPending}
    >
      <SelectTrigger className="w-[125px]">
        <SelectValue placeholder="RSVP" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="going" disabled={goingDisabled}>
            Going
          </SelectItem>
          <SelectItem value="not_going">Not going</SelectItem>
          {/* <SelectItem value="waitlist">Waitlist</SelectItem> */}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
