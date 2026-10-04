"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@laundryroom/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@laundryroom/ui/dialog";
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

type GroupStatus = "active" | "hidden" | "archived" | "nsfw" | "private";

export function GroupStatusSwitcher(props: {
  groupId: string;
  status: GroupStatus | null;
}) {
  const t = useTranslations("group");
  const utils = api.useUtils();
  const profileQuery = api.auth.getProfile.useQuery();
  // with group accounts on, going active puts the group on the network for
  // good (a public handle stays in the plc log): say so first
  const networkQuery = api.group.networkStatus.useQuery();
  const [confirming, setConfirming] = useState(false);
  const updateGroupStatus = api.group.updateStatus.useMutation({
    async onSuccess() {
      await utils.group.invalidate();
      toast.success("Group status updated");
    },
    onError: (_err) => {
      toast.error("Failed to update group status");
    },
  });
  const update = (status: GroupStatus) =>
    updateGroupStatus.mutate({ groupId: props.groupId, status });

  return (
    <>
      <Select
        value={props.status ?? undefined}
        disabled={updateGroupStatus.isPending}
        onValueChange={(value) => {
          const status = value as GroupStatus;
          if (
            status === "active" &&
            props.status !== "active" &&
            networkQuery.data?.groupAccounts
          ) {
            setConfirming(true);
            return;
          }
          update(status);
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
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("goActiveTitle")}</DialogTitle>
          </DialogHeader>
          <DialogDescription>{t("goActiveWarning")}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t("goActiveCancel")}
            </Button>
            <Button
              onClick={() => {
                setConfirming(false);
                update("active");
              }}
            >
              {t("goActiveConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
