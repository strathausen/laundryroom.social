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

type Props = {
  meetupId: string;
  rsvp?: Rsvp | null;
  onChange: (rsvp: Rsvp) => void;
};

export function RsvpSelect(props: Props) {
  const rsvpMutation = api.meetup.rsvp.useMutation();

  return (
    <Select
      value={props.rsvp ?? undefined}
      onValueChange={(rsvp: RsvpCoice) => {
        props.onChange(rsvp);
        rsvpMutation.mutate({
          id: props.meetupId,
          status: rsvp,
        });
      }}
      disabled={rsvpMutation.isPending}
    >
      <SelectTrigger className="w-[180px]">
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
