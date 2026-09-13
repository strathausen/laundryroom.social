import { Users } from "lucide-react";

import { InfoTag } from "@laundryroom/ui/info-tag";

interface Props {
  count: number;
  limit?: number | null;
}

export function MembersCount({ count, limit }: Props) {
  return (
    <InfoTag
      icon={<Users className="h-4 w-4" />}
      label={limit != null ? `${count}/${limit}` : count}
    />
  );
}
