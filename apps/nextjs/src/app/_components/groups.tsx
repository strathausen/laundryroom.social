"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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
import { Input } from "@laundryroom/ui/input";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";

type Props = {
  groupId: string;
  isNew: boolean;
};

export function UpsertGroupForm(props: Props) {
  const router = useRouter();
  const groupQuery = api.group.byId.useQuery(
    {
      id: props.groupId,
    },
    {
      enabled: !props.isNew,
    },
  );
  const form = useForm({
    schema: UpsertGroupSchema,
    defaultValues: groupQuery.data ?? {
      name: "",
      description: "",
    },
    // disabled: groupQuery.data && !props.isNew,
  });

  useEffect(() => {
    if (groupQuery.data) {
      form.setValue("name", groupQuery.data.name);
      form.setValue("description", groupQuery.data.description);
    }
  }, [groupQuery.data]);

  const utils = api.useUtils();
  const upsertGroup = api.group.upsert.useMutation({
    async onSuccess(data) {
      form.reset();
      await utils.group.invalidate();
      if ("id" in data) router.push(`/groups?highlight=${data.id}`);
    },
    onError: (err) => {
      toast.error(
        err.data?.code === "UNAUTHORIZED"
          ? "You must be logged in to create a group"
          : "Failed to modify group",
      );
    },
  });

  return (
    <Form {...form}>
      <form
        className="flex w-full max-w-2xl flex-col gap-4"
        onSubmit={form.handleSubmit((data) => {
          upsertGroup.mutate(data);
        })}
      >
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
                <Textarea {...field} placeholder="what is your group about?" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-4">
          <Button type="submit">save</Button>
          <Button
            type="button"
            onClick={() => {
              router.push("/groups");
            }}
          >
            cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
