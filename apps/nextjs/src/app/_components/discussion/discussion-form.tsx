"use client";

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

import { useDiscussions } from "~/hooks/use-discussions";

interface DiscussionFormProps {
  groupId: string;
  onSuccess: () => void;
  onError: () => void;
  onCancel: () => void;
  initialValues?: {
    id: string;
    title: string;
    content: string;
  };
}

export function DiscussionForm(props: DiscussionFormProps) {
  const discussionForm = useForm({
    schema: UpsertDiscussionSchema,
    defaultValues: {
      groupId: props.groupId,
      title: "",
      content: "",
      ...props.initialValues,
    },
  });
  const discussion = useDiscussions({ groupId: props.groupId });
  const isNew = !props.initialValues;
  return (
    <Form {...discussionForm}>
      <form
        onSubmit={discussionForm.handleSubmit(async (data) => {
          props.onSuccess();
          try {
            await discussion.upsert(data);
            discussionForm.reset();
          } catch (err) {
            console.log(err);
            props.onError();
          }
        })}
      >
        <fieldset
          className="mx-auto mb-9 mt-5 flex max-w-3xl flex-col space-y-4 border-2 border-black px-3 pb-5 pt-3"
          // disabled={upsertDiscussion.isPending}
        >
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
            <Button type="submit">{isNew ? "post" : "update"}</Button>
            <Button type="button" onClick={props.onCancel}>
              cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
