"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@laundryroom/ui/select";

import { api } from "~/trpc/react";

type RsvpCoice = "going" | "not_going";
type Rsvp = RsvpCoice | "waitlist";

interface Props {
  meetupId: string;
  groupId: string;
  rsvp?: Rsvp | null;
  onChange?: (rsvp: Rsvp) => void;
  disabled?: boolean;
}

export function RsvpSelect(props: Props) {
  const rsvpMutation = api.meetup.rsvp.useMutation();
  const utils = api.useUtils();

  return (
    <Select
      value={rsvpMutation.data ?? props.rsvp ?? undefined}
      onValueChange={async (rsvp: RsvpCoice) => {
        await rsvpMutation.mutateAsync({
          id: props.meetupId,
          status: rsvp,
        });
        await utils.meetup.byId.invalidate({ id: props.meetupId });
        await utils.meetup.byGroupId.invalidate({ groupId: props.groupId });
        props.onChange?.(rsvp);
      }}
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      disabled={props.disabled || rsvpMutation.isPending}
    >
      <SelectTrigger className="w-[125px]">
        <SelectValue placeholder="RSVP" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="going">Going</SelectItem>
          <SelectItem value="not_going">Not going</SelectItem>
          {/* <SelectItem value="waitlist">Waitlist</SelectItem> */}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
