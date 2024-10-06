"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { UpsertMeetupSchema } from "@laundryroom/db/schema";
import { Button } from "@laundryroom/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useForm,
} from "@laundryroom/ui/form";
import { Input } from "@laundryroom/ui/input";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

type Props = {
  eventId?: string;
  isNew: boolean;
};

export function UpsertMeetupForm(props: Props) {
  const router = useRouter();
  const utils = api.useUtils();
  const upsertMeetup = api.meetup.upsert.useMutation({
    async onSuccess(data) {
      form.reset();
      await utils.meetup.invalidate();
      if ("id" in data) router.push(`/events?highlight=${data.id}`);
      toast.success("Event saved");
    },
  });
  const eventQuery = api.meetup.byId.useQuery(
    { id: props.eventId! },
    { enabled: !!props.eventId },
  );
  const form = useForm({
    schema: UpsertMeetupSchema,
    defaultValues: eventQuery.data ?? {
      title: "",
      description: "",
    },
  });

  useEffect(() => {
    if (eventQuery.data) {
      form.setValue("title", eventQuery.data.title);
      form.setValue("description", eventQuery.data.description);
    }
  }, [eventQuery.data]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          upsertMeetup.mutate(data);
        })}
        // simple frame
      >
        <fieldset
          className="flex flex-col gap-4 rounded border border-gray-200 p-4"
          disabled={upsertMeetup.isPending}
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit">save</Button>
        </fieldset>
      </form>
    </Form>
  );
}
