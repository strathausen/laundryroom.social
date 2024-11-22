"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { RouterOutputs } from "@laundryroom/api";
import { UpsertGroupSchema } from "@laundryroom/db/schema";
import { Box } from "@laundryroom/ui/box";
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
import { InfoTag } from "@laundryroom/ui/info-tag";
import { Input } from "@laundryroom/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@laundryroom/ui/select";
import { Textarea } from "@laundryroom/ui/textarea";
import { toast } from "@laundryroom/ui/toast";

import { api } from "~/trpc/react";
import { MembersCount } from "./members-count";

interface Props {
  groupId: string;
  isNew: boolean;
}

export function GroupStatusSwitcher(props: {
  groupId: string;
  status: "active" | "hidden" | "archived" | null;
}) {
  const utils = api.useUtils();
  const updateGroupStatus = api.group.updateStatus.useMutation({
    async onSuccess() {
      await utils.group.invalidate();
      toast.success("Group status updated");
    },
    onError: (_err) => {
      toast.error("Failed to update group status");
    },
  });

  return (
    <Select
      value={props.status ?? undefined}
      disabled={updateGroupStatus.isPending}
      onValueChange={(status) => {
        updateGroupStatus.mutate({
          groupId: props.groupId,
          status: status as "active" | "hidden" | "archived",
        });
      }}
    >
      <SelectTrigger className="w-[125px]">
        <SelectValue placeholder="Select a status" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="hidden">Hidden</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function UpsertGroupForm(props: Props) {
  const router = useRouter();
  const groupQuery = api.group.byId.useQuery(
    { id: props.groupId },
    { enabled: !props.isNew },
  );
  const form = useForm({
    schema: UpsertGroupSchema,
    defaultValues: groupQuery.data?.group ?? {
      name: "",
      description: "",
    },
  });

  useEffect(() => {
    if (groupQuery.data?.group) {
      form.setValue("name", groupQuery.data.group.name);
      form.setValue("description", groupQuery.data.group.description);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupQuery.data]);

  const utils = api.useUtils();
  const upsertGroup = api.group.upsert.useMutation({
    async onSuccess(data) {
      form.reset();
      await utils.group.invalidate();
      if ("id" in data) router.push(`/groups?highlight=${data.id}`);
      toast.success("Group saved");
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
        onSubmit={form.handleSubmit((data) => {
          upsertGroup.mutate(data);
        })}
      >
        <fieldset
          className="flex w-full max-w-2xl flex-col gap-4"
          disabled={upsertGroup.isPending}
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
        </fieldset>
      </form>
    </Form>
  );
}

export function GroupCard(group: RouterOutputs["group"]["search"][number]) {
  return (
    <Link href={`/groups/${group.id}`}>
      <Box
        className={`flex h-48 flex-col justify-between gap-2 ${group.status === "hidden" || group.status === "archived" ? "opacity-50" : ""}`}
      >
        <div className="flex flex-1 flex-col gap-2">
          <h2 className="text-xl font-semibold uppercase">{group.name}</h2>
          <p className="line-clamp-2 pr-2">{group.description}</p>
        </div>
        {group.nextMeetupDate && (
          <p className="text-sm">
            next event: {new Date(group.nextMeetupDate).toLocaleDateString()}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {group.status === "archived" && (
            <InfoTag label="archived" icon={<span>📦</span>} />
          )}
          {group.status === "hidden" && (
            <InfoTag label="hidden" icon={<span>🕵️</span>} />
          )}
          <MembersCount count={group.membersCount} />
        </div>
      </Box>
    </Link>
  );
}

export function GroupList() {
  const [query, setQuery] = useState("");
  const groupsQuery = api.group.search.useQuery({ query });
  const myGroupsQuery = api.group.myGroups.useQuery();

  return (
    <div className="flex flex-col gap-5 text-black">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search groups"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groupsQuery.data?.map((group) => (
          <GroupCard key={group.id} {...group} />
        ))}
        {groupsQuery.isLoading && (
          <p className="col-span-3">loading groups...</p>
        )}
        {!groupsQuery.data?.length && groupsQuery.isFetched && (
          <p className="col-span-3">no groups found</p>
        )}
      </div>
      <div className="mb-7 mt-4 space-y-4 border-t-2 border-black pt-4">
        <h2 className="text-xl uppercase underline decoration-green-400 decoration-4">
          my groups
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {myGroupsQuery.data?.map((group) => (
            <GroupCard key={group.id} {...group} />
          ))}
        </div>
      </div>
    </div>
  );
}
