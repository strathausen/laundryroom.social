import { useState } from "react";
import {
  Crown,
  MoreHorizontal,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  User,
  UserX,
  X,
} from "lucide-react";

import type { RouterInputs } from "@laundryroom/api";
import { Button } from "@laundryroom/ui/button";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

// TODO get type from api
type UserRole = "owner" | "admin" | "member" | "banned" | "moderator";
interface Props {
  userName?: string | null;
  userId: string;
  userRole: UserRole;
  groupId: string;
  enableRoleChange?: boolean;
  /** only the group owner can hand over ownership */
  enableOwnershipTransfer?: boolean;
  /** the viewer's own row: they may step down, but not ban themselves */
  isSelf?: boolean;
}

const getRoleIcon = (role: UserRole) => {
  switch (role) {
    case "owner":
      return <Crown className="h-5 w-5 text-yellow-500" />;
    case "admin":
      return <ShieldCheck className="h-5 w-5 text-blue-500" />;
    case "moderator":
      return <ShieldAlert className="h-5 w-5 text-green-500" />;
    case "member":
      return <User className="h-5 w-5 text-gray-500" />;
    case "banned":
      return <UserX className="h-5 w-5 text-red-500" />;
    default:
      return <ShieldQuestion className="h-5 w-5 text-gray-300" />;
  }
};

export function UserModerator({
  userName,
  userId,
  userRole,
  groupId,
  enableRoleChange,
  enableOwnershipTransfer,
  isSelf = false,
}: Props) {
  const utils = api.useUtils();
  const changeUserRole = api.group.changeRole.useMutation({
    async onSuccess(_data) {
      toast.success("user role changed");
      await utils.group.members.invalidate();
    },
    onError(error) {
      toast.error(error.message);
    },
  });
  const transferOwnership = api.group.transferOwnership.useMutation({
    async onSuccess() {
      toast.success("ownership transferred");
      // both the new owner's and the previous owner's rows changed
      await Promise.all([
        utils.group.members.invalidate(),
        utils.group.byId.invalidate(),
      ]);
    },
    onError(error) {
      toast.error(error.message);
    },
  });
  const [role, setRole] = useState(userRole);
  const [expanded, setExpanded] = useState(false);
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const isPending = changeUserRole.isPending || transferOwnership.isPending;

  const changeRole = async (
    newRole: RouterInputs["group"]["changeRole"]["role"],
  ) => {
    const previousRole = role;
    setRole(newRole);
    try {
      await changeUserRole.mutateAsync({
        userId,
        groupId,
        role: newRole,
      });
    } catch {
      // the error toast is shown by the mutation, just roll back the optimistic update
      setRole(previousRole);
    }
  };

  const makeOwner = async () => {
    try {
      await transferOwnership.mutateAsync({ userId, groupId });
      setRole("owner");
      setConfirmTransfer(false);
      setExpanded(false);
    } catch {
      // the error toast is shown by the mutation
    }
  };

  return (
    <div className="border-2 border-black bg-white">
      <div className="flex items-center justify-between space-x-2 p-2">
        {userName ?? "anonymous"}
        <div className="flex items-center gap-2">
          {getRoleIcon(role)}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="p-0 hover:bg-transparent"
          >
            {enableRoleChange &&
              userRole !== "owner" &&
              (expanded ? (
                <X className="h-5 w-5" />
              ) : (
                <MoreHorizontal className="h-5 w-5" />
              ))}
          </Button>
        </div>
      </div>
      {expanded && enableRoleChange && (
        <div className="border-t-2 border-black bg-gray-100 p-2">
          <p className="mb-2 font-bold">change user status:</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => changeRole("admin")}
              className={`rounded-none ${role === "admin" ? "bg-green-600" : "bg-black"} text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]`}
              disabled={isPending || ["owner", "admin"].includes(role)}
            >
              admin
            </Button>
            <Button
              onClick={() => changeRole("member")}
              className={`rounded-none ${role === "member" ? "bg-yellow-600" : "bg-black"} text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]`}
              disabled={isPending || ["owner", "member"].includes(role)}
            >
              member
            </Button>
            <Button
              onClick={() => changeRole("banned")}
              className={`rounded-none ${role === "banned" ? "bg-red-600" : "bg-black"} text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]`}
              disabled={
                isPending || isSelf || ["owner", "banned"].includes(role)
              }
            >
              ban
            </Button>
            {enableOwnershipTransfer && role !== "banned" && (
              <Button
                onClick={() => setConfirmTransfer(true)}
                className="rounded-none bg-black text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]"
                disabled={isPending || confirmTransfer || role === "owner"}
              >
                make owner
              </Button>
            )}
          </div>
          {confirmTransfer && (
            <div className="mt-2 flex flex-col gap-2 border-2 border-black bg-white p-2">
              <p>
                make <b>{userName ?? "this user"}</b> the owner of this group?
                you will become an admin, and only the new owner can undo this.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  onClick={makeOwner}
                  disabled={isPending}
                >
                  yes, make owner
                </Button>
                <Button
                  variant="plattenbau"
                  onClick={() => setConfirmTransfer(false)}
                  disabled={isPending}
                >
                  nah never mind
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
