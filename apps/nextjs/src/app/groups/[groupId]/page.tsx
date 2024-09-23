import { GroupDetail } from "~/app/_components/groups";

export default async function GroupDetailsPage() {
  return (
    <main className="container h-screen max-w-screen-lg py-16 text-foreground">
      <div className="flex flex-col gap-4">
        <GroupDetail />
      </div>
    </main>
  );
}
