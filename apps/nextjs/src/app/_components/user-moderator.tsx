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
}: Props) {
  const changeUserRole = api.group.changeRole.useMutation({
    onSuccess(_data) {
      toast.success("User role changed");
    },
  });
  const [role, setRole] = useState(userRole);
  const [expanded, setExpanded] = useState(false);

  const changeRole = async (
    role: RouterInputs["group"]["changeRole"]["role"],
  ) => {
    setRole(role);
    await changeUserRole.mutateAsync({
      userId,
      groupId,
      role,
    });
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
          <p className="mb-2 font-bold">Change user status:</p>
          <div className="flex space-x-2">
            <Button
              onClick={() => changeRole("admin")}
              className={`rounded-none ${role === "admin" ? "bg-green-600" : "bg-black"} text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]`}
              disabled={
                changeUserRole.isPending || ["owner", "admin"].includes(role)
              }
            >
              admin
            </Button>
            <Button
              onClick={() => changeRole("member")}
              className={`rounded-none ${role === "member" ? "bg-yellow-600" : "bg-black"} text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]`}
              disabled={
                changeUserRole.isPending || ["owner", "member"].includes(role)
              }
            >
              member
            </Button>
            <Button
              onClick={() => changeRole("banned")}
              className={`rounded-none ${role === "banned" ? "bg-red-600" : "bg-black"} text-white shadow-[2px_2px_0px_0px_#ff00ff] transition-all duration-300 hover:-translate-x-0.5 hover:-translate-y-0.5 hover:bg-gray-800 hover:shadow-[4px_4px_0px_0px_#ff00ff] active:translate-x-0 active:translate-y-0 active:bg-gray-700 active:shadow-[1px_1px_0px_0px_#ff00ff]`}
              disabled={
                changeUserRole.isPending || ["owner", "banned"].includes(role)
              }
            >
              ban
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
