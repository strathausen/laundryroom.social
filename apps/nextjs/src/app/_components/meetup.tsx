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
  groupId: string;
  isNew: boolean;
  onSaved?: () => void;
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
      props.onSaved?.();
    },
  });
  const meetupQuery = api.meetup.byId.useQuery(
    { id: props.eventId! },
    { enabled: !!props.eventId },
  );
  const form = useForm({
    schema: UpsertMeetupSchema,
    defaultValues: {
      groupId: props.groupId,
      title: meetupQuery.data?.title ?? "",
      description: meetupQuery.data?.description || "",
      location: meetupQuery.data?.location || "",
      startTime: meetupQuery.data?.startTime.toISOString() || "",
      endTime: meetupQuery.data?.endTime?.toISOString() || "",
    },
  });

  useEffect(() => {
    if (meetupQuery.data) {
      form.setValue("title", meetupQuery.data.title);
      form.setValue("description", meetupQuery.data.description!);
      form.setValue("location", meetupQuery.data.location!);
    }
  }, [meetupQuery.data]);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => {
          upsertMeetup.mutate(data);
        })}
        // simple frame
      >
        <fieldset
          className="flex flex-col gap-4 rounded p-4"
          disabled={upsertMeetup.isPending}
        >
          {form.formState.errors && (
            <div>
              {Object.values(form.formState.errors).join(", ")}
            </div>
          )}
          {upsertMeetup.error && (
            <div>{upsertMeetup.error.message}</div>
          )}
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
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>location</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="startTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>starts at</FormLabel>
                <FormControl>
                  <Input {...field} type="datetime-local" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="endTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>ends at</FormLabel>
                <FormControl>
                  <Input {...field} type="datetime-local" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            disabled={!form.formState.isValid}
            title={!form.formState.isValid ? "Please fill out all fields" : ""}
          >
            save
          </Button>
        </fieldset>
      </form>
    </Form>
  );
}
