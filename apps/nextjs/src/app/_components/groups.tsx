"use client";

import { join } from "path";
import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

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
    defaultValues: groupQuery.data?.group ?? {
      name: "",
      description: "",
    },
    // disabled: groupQuery.data && !props.isNew,
  });

  useEffect(() => {
    if (groupQuery.data?.group) {
      form.setValue("name", groupQuery.data.group.name);
      form.setValue("description", groupQuery.data.group.description);
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

export function GroupList() {
  const groupsQuery = api.group.all.useQuery();

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {groupsQuery.data?.map((group) => (
        <Link
          key={group.id}
          className="flex cursor-pointer flex-col justify-between rounded-lg border-2 border-bermuda p-4 transition-colors hover:border-hotpink"
          href={`/groups/${group.id}`}
        >
          <div>
            <h2 className="text-xl font-bold underline decoration-bubble-gum decoration-2">
              {group.name}
            </h2>
            <p>{group.description}</p>
          </div>
          {/* stats, with dummy data (no of events, most recent event, no of users) at the bottom of the box */}
          <div className="mt-2 flex gap-2">
            <div className="flex gap-1">
              <span className="font-bold">events:</span>
              <span>3</span>
            </div>
            <div className="flex gap-1">
              <span className="font-bold">users:</span>
              <span>5</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function GroupDetail() {
  const params = useParams<{ groupId: string }>();
  const groupQuery = api.group.byId.useQuery({
    id: params.groupId,
  });
  const joinGroup = api.group.join.useMutation();
  const leaveGroup = api.group.leave.useMutation();

  if (groupQuery.error) {
    return <div>Failed to load group</div>;
  }
  if (groupQuery.isLoading || !groupQuery.data?.group) {
    return <div>Loading group...</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-5xl font-bold underline decoration-fancyorange decoration-4">
        {groupQuery.data.group.name}
      </h1>
      {/* the MDXRemote component can only run server side, and for good reason. meanwhile, we don't support mdx yet */}
      {/* <MDXRemote source={groupQuery.data?.description} /> */}
      {groupQuery.data.group.description.split("\n").map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      {/* show edit button if I'm the owner */}
      {groupQuery.data.membership?.role === "owner" && (
        <Link href={`/edit-group/${groupQuery.data.group.id}`}>
          <Button>edit</Button>
        </Link>
      )}
      {/* show join button if no membership */}
      {!groupQuery.data.membership && (
        <Button
          disabled={joinGroup.isPending || groupQuery.isRefetching}
          onClick={async() => {
            await joinGroup.mutateAsync({
              groupId: groupQuery.data.group?.id!,
            });
            groupQuery.refetch();
          }}
        >
          join this group
        </Button>
      )}
      {/* if user is not the owner and is a member, offer to leave the group */}
      {groupQuery.data.membership &&
        groupQuery.data.membership.role !== "owner" && (
          <Button
            disabled={leaveGroup.isPending || groupQuery.isRefetching}
            onClick={async () => {
              await leaveGroup.mutateAsync({
                groupId: groupQuery.data.group?.id!,
              });
              groupQuery.refetch();
            }}
          >
            leave this group
          </Button>
        )}
      {/* show events, discussions, etc */}
      {/* don't show discussion etc if not logged in */}
    </div>
  );
}
