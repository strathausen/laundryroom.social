"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { SessionProvider } from "next-auth/react";

import { Box } from "@laundryroom/ui/box";
import { PageContainer } from "@laundryroom/ui/page-container";

import { MeetupEditButton } from "~/app/_components/meetup/meetup-edit-button";
import PledgeBoardWidget from "~/app/_components/pledgeboard/pledgeboard-widget";
import { RsvpSelect } from "~/app/_components/rsvp-select";
import { Link } from "~/i18n/routing";
import { api } from "~/trpc/react";

export default function MeetupPage() {
  const params = useParams<{ meetupId: string }>();

  const meetupQuery = api.meetup.byId.useQuery({
    id: params.meetupId,
  });
  const rsvpQuery = api.meetup.myAttendance.useQuery({
    meetupId: params.meetupId,
  });

  if (!meetupQuery.data) {
    return <div className="m-auto mt-40">Loading...</div>;
  }

  // TODO is cancelled / past
  const isCancelled = meetupQuery.data.status === "cancelled";
  // add duration to meetup
  const endTime = new Date(meetupQuery.data.startTime);
  endTime.setHours(endTime.getHours() + 1);
  const isPast = endTime < new Date();
  const isOnGoing =
    meetupQuery.data.startTime < new Date() && endTime > new Date();
  const disabled = isCancelled || isPast;

  return (
    <PageContainer>
      <SessionProvider>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <div className="flex items-center justify-between">
            <Link
              href={`/group/${meetupQuery.data.groupId}/meetups`}
              className="flex items-center gap-2"
            >
              <ArrowLeftIcon /> back to group{" "}
              <strong>{meetupQuery.data.group.name}</strong>
            </Link>
            {meetupQuery.data.isSuperUser && (
              <MeetupEditButton meetup={meetupQuery.data} />
            )}
          </div>
          <Box className="relative flex flex-col gap-4">
            <h1 className="border-b-2 border-black pb-2 text-3xl uppercase">
              {meetupQuery.data.title}
            </h1>
            {isCancelled && (
              <div className="text-red-500">This meetup has been cancelled</div>
            )}
            {isPast && (
              <div className="text-red-500">This meetup has ended</div>
            )}
            {isOnGoing && (
              <div className="text-green-500">This meetup is on going</div>
            )}
            <h2 className="font-extrabold underline decoration-green-400 decoration-4">
              what?
            </h2>
            <div>{meetupQuery.data.description}</div>
            <h2 className="font-extrabold underline decoration-green-400 decoration-4">
              when?
            </h2>
            <div>{meetupQuery.data.startTime.toLocaleString()}</div>
            <h2 className="font-extrabold underline decoration-green-400 decoration-4">
              where?
            </h2>
            <div>{meetupQuery.data.location}</div>
            <h2 className="font-extrabold underline decoration-green-400 decoration-4">
              are you coming?
            </h2>
            <div className="flex items-center gap-4">
              please rsvp here:{" "}
              <RsvpSelect
                groupId={meetupQuery.data.groupId}
                meetupId={meetupQuery.data.id}
                rsvp={rsvpQuery.data}
                disabled={disabled}
              />
            </div>
            {/* <div className="absolute top-0 right-0">
              <MeetupEditButton meetup={meetupQuery.data} />
            </div> */}
          </Box>
          <Box className="flex flex-col gap-4">
            <h2 className="font-extrabold underline decoration-green-400 decoration-4">
              who's coming?
            </h2>
            {meetupQuery.data.attendees.length === 0 ? (
              <p>
                no one is coming yet. don't loose hope. someone will come. I'm
                sure of it.
              </p>
            ) : (
              <p>
                so far, {meetupQuery.data.attendees.length}{" "}
                {meetupQuery.data.attendees.length === 1
                  ? "person is"
                  : "people are"}{" "}
                coming.
              </p>
            )}
            <ul className="list-inside list-disc">
              {meetupQuery.data.attendees.map((rsvp) => (
                <li key={rsvp.userId}>
                  {rsvp.user.name} - {rsvp.status}
                </li>
              ))}
            </ul>
          </Box>
          <PledgeBoardWidget
            isAdmin={meetupQuery.data.isSuperUser}
            meetupId={meetupQuery.data.id}
            disabled={disabled}
          />
          {/* TODO Talk / discussions */}
        </div>
      </SessionProvider>
    </PageContainer>
  );
}
