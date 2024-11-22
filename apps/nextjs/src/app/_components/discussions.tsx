"use client";

import { useState } from "react";

import { Button } from "@laundryroom/ui/button";
import { toast } from "@laundryroom/ui/toast";

import { useDiscussions } from "~/hooks/use-discussions";
import { DiscussionForm } from "./discussion/discussion-form";
import { DiscussionPost } from "./discussion/discussion-post";

export function DiscussionWidget({ groupId }: { groupId: string }) {
  const [showNewDiscussionForm, setShowNewDiscussionForm] = useState(false);
  const discussions = useDiscussions({ groupId });
  return (
    <div>
      <Button
        onClick={() => setShowNewDiscussionForm(true)}
        className="mx-auto flex"
      >
        write something
      </Button>
      {showNewDiscussionForm && (
        <DiscussionForm
          groupId={groupId}
          onSuccess={() => {
            setShowNewDiscussionForm(false);
          }}
          onError={() => {
            toast.error("Oh darn it. Something went wrong. ¯\\_(ツ)_/¯");
          }}
          onCancel={() => setShowNewDiscussionForm(false)}
        />
      )}
      <div className="m-auto my-7 flex max-w-3xl flex-col gap-5">
        {discussions.items.map((discussion) => (
          <DiscussionPost
            discussion={discussion}
            key={discussion.id}
            groupId={groupId}
          />
        ))}
        {discussions.hasNextPage && (
          <Button
            onClick={() => discussions.fetchNextPage()}
            className="mx-auto"
          >
            load more
          </Button>
        )}
      </div>
    </div>
  );
}
