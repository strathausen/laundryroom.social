import Image from "next/image";

import type { RouterOutputs } from "@laundryroom/api";
import { Box } from "@laundryroom/ui/box";
import { InfoTag } from "@laundryroom/ui/info-tag";

import { Link } from "~/i18n/routing";
import { MembersCount } from "../members-count";

export function GroupCard(group: RouterOutputs["group"]["search"][number]) {
  return (
    <Link href={`/group/${group.id}/meetups`}>
      <Box
        className={`relative flex h-56 flex-col justify-between gap-2 ${group.status === "hidden" || group.status === "archived" ? "opacity-50" : ""}`}
      >
        {group.image && (
          <Image
            src={group.image}
            alt={group.name}
            width={800}
            height={400}
            className="absolute inset-0 object-fill"
          />
        )}
        <div className="z-10 line-clamp-2 flex flex-1 flex-col gap-2">
          <h2 className="bg-white text-xl font-semibold uppercase">
            {group.name}
          </h2>
          <p className="line-clamp-3 overflow-ellipsis bg-white pr-2">
            {group.description}
          </p>
        </div>
        {group.nextMeetupDate && (
          <p className="bg-white text-sm">
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
