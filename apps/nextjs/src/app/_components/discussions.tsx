"use client";

import { useState } from "react";

import { RouterOutputs } from "@laundryroom/api";
import { UpsertDiscussionSchema } from "@laundryroom/db/schema";
import { Button } from "@laundryroom/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  useForm,
} from "@laundryroom/ui/form";
import { Input } from "@laundryroom/ui/input";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

function DiscussionPost({
  discussion,
}: {
  discussion: RouterOutputs["discussion"]["byGroupId"][number];
}) {
  const createCommentMutation = api.discussion.createComment.useMutation();
  const commentsQuery = api.discussion.comments.useQuery(
    { discussionId: discussion.id },
    { enabled: false },
  );
  return (
    <div
      key={discussion.id}
      className="flex flex-col gap-2 rounded-md border-2 border-tahiti px-4 py-3"
    >
      <p className="text-sm text-tahiti">{discussion.user.name}</p>
      <h2 className="font-bold">{discussion.title}</h2>
      <p>{discussion.content}</p>
			<div>comments: {discussion.commentCount}</div>
      <Input />
      <div className="flex justify-between">
        <Button>reply</Button>
        <div className="flex gap-3">
          <Button>flag</Button>
          <Button>delete</Button>
        </div>
      </div>
    </div>
  );
}

export function DiscussionWidget(props: { groupId: string }) {
  const [showNewDiscussionForm, setShowNewDiscussionForm] = useState(false);
  const discussionsQuery = api.discussion.byGroupId.useQuery({
    groupId: props.groupId,
  });
  const discussionForm = useForm({
    schema: UpsertDiscussionSchema,
    defaultValues: {
      groupId: props.groupId,
      title: "",
      content: "",
    },
  });
  const upsertDiscussion = api.discussion.create.useMutation({
    onSuccess() {
      discussionForm.reset();
      setShowNewDiscussionForm(false);
      discussionsQuery.refetch();
    },
    onError() {
      toast.error("Failed to create discussion");
    },
  });
  return (
    <div>
      <Button onClick={() => setShowNewDiscussionForm(true)}>
        open a new thread
      </Button>
      {showNewDiscussionForm && (
        <Form {...discussionForm}>
          <form
            onSubmit={discussionForm.handleSubmit((data) => {
              console.log(data);
              upsertDiscussion.mutate(data);
            })}
          >
            <fieldset className="mx-auto mb-9 mt-5 flex max-w-3xl flex-col space-y-4 border-2 px-3 pb-5 pt-3">
              <FormField
                control={discussionForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>title</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={discussionForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>content</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className="flex gap-4">
                <Button type="submit">post</Button>
                <Button
                  type="button"
                  onClick={() => setShowNewDiscussionForm(false)}
                >
                  cancel
                </Button>
              </div>
            </fieldset>
          </form>
        </Form>
      )}
      <div className="m-auto my-7 flex max-w-3xl flex-col gap-5">
        {discussionsQuery.data?.map((discussion) => (
          <DiscussionPost discussion={discussion} />
        ))}
      </div>
    </div>
  );
}
