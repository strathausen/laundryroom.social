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
      value={rsvpMutation.data ?? props.rsvp ?? undefined}
      onValueChange={async (rsvp: RsvpCoice) => {
        await rsvpMutation.mutateAsync({
          id: props.meetupId,
          status: rsvp,
        });
        props.onChange(rsvp);
      }}
      disabled={rsvpMutation.isPending}
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

{
  /* <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="bg-black text-white rounded-none uppercase hover:bg-gray-800 active:bg-gray-700 transition-all duration-300 shadow-[4px_4px_0px_0px_#ff00ff] hover:shadow-[6px_6px_0px_0px_#ff00ff] active:shadow-[2px_2px_0px_0px_#ff00ff] hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0 active:translate-y-0">
          RSVP
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_0px_#ff00ff]">
        <DropdownMenuItem className="hover:bg-gray-100 active:bg-gray-200 uppercase">Going</DropdownMenuItem>
        <DropdownMenuItem className="hover:bg-gray-100 active:bg-gray-200 uppercase">Maybe</DropdownMenuItem>
        <DropdownMenuItem className="hover:bg-gray-100 active:bg-gray-200 uppercase">Not Going</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu></div> */
}
