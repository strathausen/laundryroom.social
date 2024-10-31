"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { UpsertGroupSchema } from "@laundryroom/db/schema";
import { Box } from "@laundryroom/ui/box";
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
import { MembersWidget } from "./members";
import { MembersCount } from "./members-count";
import { RsvpSelect } from "./rsvp-select";

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

export function GroupList() {
  const [query, setQuery] = useState("");
  const groupsQuery = api.group.search.useQuery({ query });

  return (
    <div className="flex flex-col gap-5 text-black">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search groups"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groupsQuery.data?.map((group) => (
          <Link key={group.id} href={`/groups/${group.id}`}>
            <Box className="flex min-h-36 flex-col justify-between">
              <div>
                <h2 className="text-xl font-semibold uppercase">
                  {group.name}
                </h2>
                <p className="">{group.description}</p>
              </div>
              <div className="flex justify-end">
                <MembersCount count={group.membersCount} />
              </div>
            </Box>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function GroupDetail() {
  const params = useParams<{ groupId: string }>();
  const session = useSession();
  const [showCreateMeetup, setShowCreateMeetup] = useState(false);
  const [editableEventId, setEditableEventId] = useState<string | undefined>();
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
    return <div className="flex flex-col">Loading group...</div>;
  }
  const { membership, group } = groupQuery.data;

  return (
    <div className="flex flex-col gap-5 text-black">
      <h2 className="border-b-2 border-black text-2xl uppercase">
        {group.name}
      </h2>
      <Box className="mx-auto w-full max-w-2xl">
        <h2 className="mb-2 text-xl uppercase">about this group</h2>
        {/* the MDXRemote component can only run server side, need to figur this out */}
        {/* <MDXRemote source={groupQuery.data.description} /> */}
        {group.description.split("\n").map((line, i) => (
          <p className="text-base" key={i}>
            {line}
          </p>
        ))}
      </Box>
      <div className="flec-col flex justify-center">
        {/* show edit button if I'm the owner */}
        {membership?.role === "owner" && (
          <div className="flex gap-4">
            <Link href={`/edit-group/${groupQuery.data.group.id}`}>
              <Button>edit</Button>
            </Link>
            <Dialog
              open={showCreateMeetup}
              onOpenChange={(state) => {
                setShowCreateMeetup(state);
                setEditableEventId(undefined);
              }}
            >
              <DialogTrigger asChild>
                <Button>create event</Button>
              </DialogTrigger>
              <DialogContent>
                <UpsertMeetupForm
                  groupId={params.groupId}
                  eventId={editableEventId}
                  onSaved={async () => {
                    setShowCreateMeetup(false);
                    setEditableEventId(undefined);
                    await listMeetups.refetch();
                  }}
                />
              </DialogContent>
            </Dialog>
            <GroupStatusSwitcher
              groupId={params.groupId}
              status={group.status}
            />
          </div>
        )}
        {/* show join button if no membership */}
        {!membership &&
          (session.data?.user ? (
            <Button
              disabled={joinGroup.isPending || groupQuery.isRefetching}
              onClick={async () => {
                await joinGroup.mutateAsync({ groupId: group.id });
                await groupQuery.refetch();
              }}
            >
              join this group
            </Button>
          ) : (
            <Link
              href="/api/auth/signin"
              className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
            >
              log in to join this group
            </Link>
          ))}
        {/* if user is not the owner and is a member, offer to leave the group */}
        {membership && membership.role !== "owner" && (
          <div className="text-black/80">
            you're a member of this group,{" "}
            <Button
              className="p-1"
              disabled={leaveGroup.isPending || groupQuery.isRefetching}
              onClick={async () => {
                if (!groupQuery.data.group) return;
                await leaveGroup.mutateAsync({
                  groupId: groupQuery.data.group.id,
                });
                await groupQuery.refetch();
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
        <h2 className="border-b-2 border-black text-2xl uppercase">
          upcoming meetups
        </h2>
        <div className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-3">
          {listMeetups.data?.map((meetup) => (
            <Box
              key={meetup.id}
              className="flex flex-col justify-between gap-2"
            >
              <div className="flex flex-col space-y-2">
                <h3 className="text-xl uppercase">{meetup.title}</h3>
                <p className="underline decoration-green-400 decoration-4 underline-offset-4">
                  {meetup.description}
                </p>
              </div>
              <div className="flex flex-col space-y-2">
                <p>time: {new Date(meetup.startTime).toLocaleString()}</p>
                {/* <p>end: {new Date(meetup.endTime).toLocaleString()}</p> */}
                <div className="flex gap-4">
                  <RsvpSelect
                    meetupId={meetup.id}
                    rsvp={meetup.attendance?.status}
                    onChange={(_status) => {
                      //
                    }}
                  />
                  {membership?.role === "owner" && (
                    <Button
                      onClick={() => {
                        setEditableEventId(meetup.id);
                        setShowCreateMeetup(true);
                      }}
                    >
                      edit
                    </Button>
                  )}
                </div>
              </div>
            </Box>
          ))}
          {!listMeetups.data?.length && <p>no upcoming meetups</p>}
        </div>
      </div>
      {/* don't show discussion etc if not logged in */}
      <h2 className="border-b-2 border-black text-2xl uppercase">talk</h2>
      {session.data?.user ? (
        <DiscussionWidget groupId={params.groupId} />
      ) : (
        <Link
          href="/api/auth/signin"
          className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
        >
          log in to join the discussion
        </Link>
      )}
      <h2 className="border-b-2 border-black text-2xl uppercase">members</h2>
      {session.data?.user ? (
        <MembersWidget groupId={params.groupId} />
      ) : (
        <Link
          href="/api/auth/signin"
          className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
        >
          log in to see members
        </Link>
      )}
      <br className="mb-12" />
    </div>
  );
}
