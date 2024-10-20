import { Users } from "lucide-react";

export function MembersCount({ count }: { count: number }) {
  return (
    <span className="bg-black px-2 py-1 text-sm text-white">
      <Users className="mr-1 inline-block h-4 w-4" />
      {count}
    </span>
  );
}
