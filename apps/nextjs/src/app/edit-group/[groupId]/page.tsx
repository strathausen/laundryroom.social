"use client";

import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";
import { Label } from "@laundryroom/ui/label";
import { Textarea } from "@laundryroom/ui/textarea";
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
        <h1 className="text-5xl font-bold underline decoration-fancyorange decoration-4 pb-2">
          {params.groupId === "new" ? "Create Group" : "Edit Group"}
        </h1>
        <div>
          <Label>Group Name</Label>
          <Input className="max-w-md" placeholder="test test input" />
        </div>
        <div>
          <Label>Group Description</Label>
          <Textarea className="max-w-md" placeholder="test test textarea" />
        </div>
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
