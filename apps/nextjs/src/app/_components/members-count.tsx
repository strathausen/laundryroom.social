import { Users } from "lucide-react";

import { InfoTag } from "@laundryroom/ui/info-tag";

export function MembersCount({ count }: { count: number }) {
  return <InfoTag icon={<Users className="h-4 w-4" />} label={count} />;
}
