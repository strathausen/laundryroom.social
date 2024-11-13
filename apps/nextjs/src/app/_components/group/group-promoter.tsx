"use client";

import { useState } from "react";

import { Button } from "@laundryroom/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@laundryroom/ui/dialog";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

interface Props {
  groupId: string;
  onDone: () => void;
}

export function GroupPromoter(props: Props) {
  const promoteGroup = api.promotion.askForIt.useMutation();
  const [message, setMessage] = useState("");
  return (
    <Dialog>
      <DialogTrigger>
        <Button>free group promotion! 🚀🚀🚀</Button>
      </DialogTrigger>
      <DialogContent>
        {/* loudspeaker emoji */}
        <DialogTitle>
          free group promotion{" "}
          <span role="img" aria-label="loudspeaker">
            📢
          </span>
        </DialogTitle>
        <p>
          do you want me to promote your group for free? I'll put up{" "}
          <b>posters</b> in the city and <b>tell everyone about</b> it!
        </p>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="anything you want to tell me?"
          disabled={promoteGroup.isPending}
        />
        <DialogFooter className="flex items-end gap-2">
          <Button
            variant="plattenbau"
            onClick={async () => {
              await promoteGroup.mutateAsync({
                groupId: props.groupId,
                status: "not_interested",
                message,
              });
              toast.info("ok, I won't bother you again");
              props.onDone();
            }}
            disabled={promoteGroup.isPending}
          >
            no thanks. 🙅‍♂️
          </Button>
          <Button
            variant="brutal"
            onClick={async () => {
              await promoteGroup.mutateAsync({
                groupId: props.groupId,
                status: "pending",
                message,
              });
              toast.info("cool! I'll get back to you soon 🚀");
              props.onDone();
            }}
            disabled={promoteGroup.isPending}
          >
            yes! 🌟
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
