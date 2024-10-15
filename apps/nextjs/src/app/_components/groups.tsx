"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import { UpsertGroupSchema } from "@laundryroom/db/schema";
import { Button } from "@laundryroom/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@laundryroom/ui/dialog";
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
import { DiscussionWidget } from "./discussions";
import { UpsertMeetupForm } from "./meetup";
import { RsvpSelect } from "./rsvp-select";

type Props = {
  groupId: string;
  isNew: boolean;
};

export function GroupStatusSwitcher(props: {
  groupId: string;
  status: "active" | "hidden" | "archived";
}) {
  const utils = api.useUtils();
  const updateGroupStatus = api.group.updateStatus.useMutation({
    async onSuccess() {
      await utils.group.invalidate();
      toast.success("Group status updated");
    },
    onError: (err) => {
      toast.error("Failed to update group status");
    },
  });

  return (
    <Select
      value={props.status}
      disabled={updateGroupStatus.isPending}
      onValueChange={(status) => {
        updateGroupStatus.mutate({
          groupId: props.groupId,
          status: status as "active" | "hidden" | "archived",
        });
      }}
    >
      <SelectTrigger className="w-[180px]">
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

export function GroupList() {
  const [query, setQuery] = useState("");
  const groupsQuery = api.group.search.useQuery({ query });

  return (
    <div className="flex flex-col gap-5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search groups"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groupsQuery.data?.map((group) => (
          <Link
            key={group.id}
            className="flex cursor-pointer flex-col justify-between rounded-lg border-2 border-bermuda p-4 transition-colors hover:border-bubble-gum"
            href={`/groups/${group.id}`}
          >
            <div>
              <h2 className="text-xl font-bold underline decoration-bubble-gum decoration-2">
                {group.name}
              </h2>
              <p>{group.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GroupDetail() {
  const params = useParams<{ groupId: string }>();
  const [showCreateMeetup, setShowCreateMeetup] = useState(false);
  const groupQuery = api.group.byId.useQuery({
    id: params.groupId,
  });
  const joinGroup = api.group.join.useMutation();
  const leaveGroup = api.group.leave.useMutation();
  const listMeetups = api.meetup.byGroupId.useQuery({
    groupId: params.groupId,
  });

  if (groupQuery.error) {
    return <div>Failed to load group</div>;
  }
  if (groupQuery.isLoading || !groupQuery.data?.group) {
    return <div>Loading group...</div>;
  }
  const { membership, group } = groupQuery.data;

  return (
    <div className="flex max-h-svh flex-col gap-4 overflow-y-scroll">
      <h1 className="text-5xl font-bold underline decoration-fancyorange decoration-4">
        {group.name}
      </h1>
      {/* the MDXRemote component can only run server side, need to figur this out */}
      {/* <MDXRemote source={groupQuery.data.description} /> */}
      {group.description.split("\n").map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <div>
        {/* show edit button if I'm the owner */}
        {membership?.role === "owner" && (
          <div className="flex gap-4">
            <Link href={`/edit-group/${groupQuery.data.group.id}`}>
              <Button>edit</Button>
            </Link>
            <Dialog open={showCreateMeetup} onOpenChange={setShowCreateMeetup}>
              <DialogTrigger asChild>
                <Button>create event</Button>
              </DialogTrigger>
              <DialogContent>
                <UpsertMeetupForm
                  isNew={true}
                  groupId={params.groupId}
                  onSaved={() => {
                    setShowCreateMeetup(false);
                    listMeetups.refetch();
                  }}
                />
              </DialogContent>
            </Dialog>
            <GroupStatusSwitcher
              groupId={params.groupId}
              status={group.status!}
            />
          </div>
        )}
        {/* show join button if no membership */}
        {!membership && (
          <Button
            disabled={joinGroup.isPending || groupQuery.isRefetching}
            onClick={async () => {
              await joinGroup.mutateAsync({ groupId: group?.id! });
              groupQuery.refetch();
            }}
          >
            join this group
          </Button>
        )}
        {/* if user is not the owner and is a member, offer to leave the group */}
        {membership && membership.role !== "owner" && (
          <div className="text-muted-foreground">
            you're a member of this group,{" "}
            <Button
              className="p-1"
              disabled={leaveGroup.isPending || groupQuery.isRefetching}
              onClick={async () => {
                await leaveGroup.mutateAsync({
                  groupId: groupQuery.data.group?.id!,
                });
                groupQuery.refetch();
              }}
              variant={"link"}
            >
              leave this group
            </Button>
          </div>
        )}
      </div>
      {/* show events, discussions, etc */}
      <div className="my-8">
        <h2 className="border-b-2 border-b-foreground text-3xl">
          upcoming meetups
        </h2>
        <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-3">
          {listMeetups.data?.map((meetup) => (
            <div
              key={meetup.id}
              className="flex cursor-pointer flex-col justify-between overflow-hidden rounded border-2 border-fancyorange p-4"
            >
              <div className="mb-2 flex flex-col space-y-2">
                <h3 className="font-bold">{meetup.title}</h3>
                <p>{meetup.description}</p>
                <p>start: {new Date(meetup.startTime).toLocaleString()}</p>
                <p>end: {new Date(meetup.endTime).toLocaleString()}</p>
              </div>
              <RsvpSelect
                meetupId={meetup.id}
                rsvp={meetup.attendance?.status}
                onChange={() => {}}
              />
            </div>
          ))}
        </div>
      </div>
      {/* don't show discussion etc if not logged in */}
      <h2 className="border-b-2 border-b-foreground text-3xl">
        talk to each other
      </h2>
      <DiscussionWidget groupId={params.groupId} />
    </div>
  );
}
