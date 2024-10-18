"use client";

import { useState } from "react";
import { ChevronDown, MessageCircle } from "lucide-react";

import type { RouterOutputs } from "@laundryroom/api";
import { UpsertDiscussionSchema } from "@laundryroom/db/schema";
import { Box } from "@laundryroom/ui/box";
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
  const [commentContent, setCommentContent] = useState("");
  const createCommentMutation = api.discussion.createComment.useMutation();
  const commentsQuery = api.discussion.comments.useQuery(
    { discussionId: discussion.id },
    { enabled: false },
  );
  return (
    <Box key={discussion.id} className="flex flex-col gap-2 px-4 py-3">
      <p className="text-sm font-semibold">{discussion.user.name}</p>
      <h2 className="text-xl uppercase">{discussion.title}</h2>
      <p className="underline decoration-green-400 decoration-4">
        {discussion.content}
      </p>
      <div>comments: {discussion.commentCount}</div>
      <div className="flex flex-col gap-2">
        {commentsQuery.data?.map((comment) => (
          <div key={comment.id} className="flex gap-2 bg-gray-100 p-2">
            <p className="font-semibold">{comment.user.name}:</p>
            <p>{comment.content}</p>
          </div>
        ))}
      </div>
      {!commentsQuery.isFetched && discussion.commentCount > 0 && (
        <Button
          onClick={() => commentsQuery.refetch()}
          disabled={commentsQuery.isFetching}
          variant="plattenbau"
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          load comments
        </Button>
      )}
      <form
        className="flex gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          // TODO optimistic update
          await createCommentMutation.mutateAsync({
            discussionId: discussion.id,
            content: commentContent,
          });
          await commentsQuery.refetch();
          setCommentContent("");
        }}
      >
        <Input
          value={commentContent}
          disabled={createCommentMutation.isPending}
          onChange={(e) => setCommentContent(e.target.value)}
        />
        <Button
          type="submit"
          variant="brutal"
          disabled={
            createCommentMutation.isPending || commentContent.length < 4
          }
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          comment
        </Button>
      </form>
    </Box>
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
    async onSuccess() {
      discussionForm.reset();
      setShowNewDiscussionForm(false);
      await discussionsQuery.refetch();
    },
    onError() {
      toast.error("Failed to create discussion");
    },
  });
  return (
    <div>
      <Button
        onClick={() => setShowNewDiscussionForm(true)}
        className="mx-auto flex"
      >
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
                      <Textarea {...field} rows={5} />
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
