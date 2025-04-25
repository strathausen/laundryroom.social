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

export function GroupStatusSwitcher(props: {
  groupId: string;
  status: "active" | "hidden" | "archived" | "nsfw" | "private" | null;
}) {
  const utils = api.useUtils();
  const profileQuery = api.auth.getProfile.useQuery();
  const updateGroupStatus = api.group.updateStatus.useMutation({
    async onSuccess() {
      await utils.group.invalidate();
      toast.success("Group status updated");
    },
    onError: (_err) => {
      toast.error("Failed to update group status");
    },
  });

  return (
    <Select
      value={props.status ?? undefined}
      disabled={updateGroupStatus.isPending}
      onValueChange={(status) => {
        updateGroupStatus.mutate({
          groupId: props.groupId,
          status: status as
            | "active"
            | "hidden"
            | "archived"
            | "nsfw"
            | "private",
        });
      }}
    >
      <SelectTrigger className="w-[125px]">
        <SelectValue placeholder="Select a status" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="hidden">Hidden</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
          {profileQuery.data?.flags?.includes("nsfw") && (
            <SelectItem value="nsfw">NSFW 🌶️</SelectItem>
          )}
          <SelectItem value="private">Private</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
