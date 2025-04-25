import { useState } from "react";
import { Pen } from "lucide-react";

import type { RouterOutputs } from "@laundryroom/api";
import { Button } from "@laundryroom/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@laundryroom/ui/dialog";

import { api } from "~/trpc/react";
import { UpsertMeetupForm } from "./meetup-form";

interface Props {
  meetup: RouterOutputs["meetup"]["byId"];
}

export function MeetupEditButton({ meetup }: Props) {
  const [showUpsertMeetup, setShowUpsertMeetup] = useState(false);
  const utils = api.useUtils();
  return (
    <Dialog open={showUpsertMeetup} onOpenChange={setShowUpsertMeetup}>
      <DialogTrigger asChild>
        <Button
          variant={"ghost"}
          className="relative -right-2 -top-2 p-2 opacity-50 transition-opacity hover:opacity-100"
        >
          <Pen className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto uppercase text-black">
        <DialogTitle>Edit Meetup</DialogTitle>
        <UpsertMeetupForm
          groupId={meetup.groupId}
          meetupId={meetup.id}
          onSaved={async () => {
            await utils.meetup.byId.invalidate({ id: meetup.id });
            setShowUpsertMeetup(false);
          }}
          onCancel={() => {
            setShowUpsertMeetup(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
