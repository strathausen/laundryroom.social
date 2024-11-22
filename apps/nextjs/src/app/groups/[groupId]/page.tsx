import { SessionProvider } from "next-auth/react";

import { GroupDetail } from "~/app/_components/group/group-detail";

export default function GroupDetailsPage() {
  return (
    <main className="container my-16 min-h-screen max-w-screen-lg">
      <SessionProvider>
        <GroupDetail />
      </SessionProvider>
    </main>
  );
}
