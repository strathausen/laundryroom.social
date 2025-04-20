"use client";

import { useEffect, useState } from "react";

import { UpsertGroupSchema } from "@laundryroom/db/schema";
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
import { ImageUpload } from "@laundryroom/ui/image-upload";
import { Input } from "@laundryroom/ui/input";
import { Textarea } from "@laundryroom/ui/textarea";
import { TimezoneSelect } from "@laundryroom/ui/timezone-select";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

interface Props {
  groupId: string;
  isNew: boolean;
  onSubmit: (groupId: string) => void;
  onCancel: () => void;
}

export function GroupForm(props: Props) {
  const [imageUrl, setImageUrl] = useState<string>();
  const groupQuery = api.group.byId.useQuery(
    { id: props.groupId },
    { enabled: !props.isNew },
  );
  const form = useForm({
    schema: UpsertGroupSchema,
    defaultValues: {
      name: "",
      description: "",
      timeZone: "UTC",
      image: null,
    },
  });

  useEffect(() => {
    if (groupQuery.data?.group) {
      const group = groupQuery.data.group;
      form.reset({
        id: group.id,
        name: group.name,
        description: group.description,
        image: group.image,
        timeZone: group.timeZone ?? "UTC",
      });
      setImageUrl(group.image ?? undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupQuery.data]);

  const utils = api.useUtils();
  const upsertGroup = api.group.upsert.useMutation({
    async onSuccess(data) {
      form.reset();
      await utils.group.invalidate();
      toast.success("Group saved ✅");
      if ("id" in data) {
        props.onSubmit(data.id);
      } else {
        props.onSubmit(props.isNew ? "" : props.groupId);
      }
    },
    onError: (err) => {
      toast.error(
        err.data?.code === "UNAUTHORIZED"
          ? "You must be logged in to create a group"
          : `Failed to ${props.isNew ? "create" : "modify"} group`,
      );
    },
  });

  const onSubmit = (data: any) => {
    upsertGroup.mutate({
      ...data,
      image: data.image ?? null,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset
          className="flex w-full max-w-2xl flex-col gap-4"
          disabled={upsertGroup.isPending}
        >
          <ImageUpload
            prefix="group"
            imageUrl={imageUrl}
            onChange={(imageUrl) => {
              form.setValue("image", imageUrl);
              setImageUrl(imageUrl);
            }}
          />
          <Button
            onClick={(e) => {
              e.preventDefault();
              form.setValue("image", null);
              setImageUrl(undefined);
            }}
            variant={"ghost"}
            disabled={!imageUrl}
          >
            remove image
          </Button>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>group name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="a catchy name" />
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
                <FormLabel>group description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="what is your group about?"
                    rows={5}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timeZone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>time zone 🌏⏰</FormLabel>
                <FormControl>
                  <TimezoneSelect
                    value={field.value}
                    onChange={(tz) => field.onChange(tz.value)}
                  />
                </FormControl>
                <div className="text-sm text-gray-500">
                  {field.value} - {groupQuery.data?.group?.timeZone}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="mt-2 flex gap-4 border-t-2 border-black pt-4">
            <Button type="submit">save</Button>
            <Button type="button" onClick={props.onCancel}>
              cancel
            </Button>
          </div>
        </fieldset>
      </form>
    </Form>
  );
}
