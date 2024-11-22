import Link from "next/link";

import type { RouterOutputs } from "@laundryroom/api";
import { Box } from "@laundryroom/ui/box";
import { InfoTag } from "@laundryroom/ui/info-tag";

import { MembersCount } from "../members-count";

export function GroupCard(group: RouterOutputs["group"]["search"][number]) {
  return (
    <Link href={`/groups/${group.id}`}>
      <Box
        className={`flex h-48 flex-col justify-between gap-2 ${group.status === "hidden" || group.status === "archived" ? "opacity-50" : ""}`}
      >
        <div className="flex flex-1 flex-col gap-2">
          <h2 className="text-xl font-semibold uppercase">{group.name}</h2>
          <p className="line-clamp-2 pr-2">{group.description}</p>
        </div>
        {group.nextMeetupDate && (
          <p className="text-sm">
            next event: {new Date(group.nextMeetupDate).toLocaleDateString()}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {group.status === "archived" && (
            <InfoTag label="archived" icon={<span>📦</span>} />
          )}
          {group.status === "hidden" && (
            <InfoTag label="hidden" icon={<span>🕵️</span>} />
          )}
          <MembersCount count={group.membersCount} />
        </div>
      </Box>
    </Link>
  );
}
