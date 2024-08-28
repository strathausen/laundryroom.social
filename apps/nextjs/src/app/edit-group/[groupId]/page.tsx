"use client";

import { Button } from "@laundryroom/ui/button";

import { UpsertGroupForm } from "~/app/_components/groups";

interface PageProps {
  params: {
    groupId: string;
  };
}

export default function EditGroupPage({ params }: PageProps) {
  return (
    <main className="container h-screen max-w-screen-lg py-16 text-foreground">
      <div className="flex flex-col gap-4">
        <h1 className="pb-2 text-5xl font-bold underline decoration-fancyorange decoration-4">
          {params.groupId === "new" ? "Create Group" : "Edit Group"}
        </h1>
        <div className="flex flex-row gap-4 pt-2">
          <Button>Save the group! ✨</Button>
          <Button variant="destructive">Delete the group! 😱</Button>
          <Button variant="outline">archive the group! 🚫</Button>
          <Button variant="secondary">Cancel</Button>
        </div>
        <div>
          <UpsertGroupForm />
        </div>
      </div>
    </main>
  );
}
