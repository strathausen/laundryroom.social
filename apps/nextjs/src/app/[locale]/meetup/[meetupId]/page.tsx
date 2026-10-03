"use client";

import React from "react";
import { useParams } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Box } from "@laundryroom/ui/box";
import { PageContainer } from "@laundryroom/ui/page-container";

import { LoginCta } from "~/app/_components/login-cta";
import { MeetupEditButton } from "~/app/_components/meetup/meetup-edit-button";
import PledgeBoardWidget from "~/app/_components/pledgeboard/pledgeboard-widget";
import { RsvpSelect } from "~/app/_components/rsvp-select";
import { authClient } from "~/auth-client";
import { Link } from "~/i18n/routing";
import { api } from "~/trpc/react";

export default function MeetupPage() {
  const t = useTranslations("meetupPage");
  const params = useParams<{ meetupId: string }>();
  const session = authClient.useSession();

  const meetupQuery = api.meetup.byId.useQuery(
    {
      id: params.meetupId,
    },
    {
      // a missing meetup stays missing, no point in retrying
      retry: (failureCount, error) =>
        error.data?.code !== "NOT_FOUND" && failureCount < 3,
    },
  );
  const rsvpQuery = api.meetup.myAttendance.useQuery({
    meetupId: params.meetupId,
  });

  // the api answers "not found" for meetups of private, nsfw and archived
  // groups the viewer is not a member of, and for hidden meetups
  if (meetupQuery.error) {
    return (
      <PageContainer>
        <Box>
          {meetupQuery.error.data?.code !== "NOT_FOUND" ? (
            <p>{meetupQuery.error.message}</p>
          ) : session.data ? (
            <p>{t("notFound")}</p>
          ) : (
            <LoginCta message={t("logInToSee")}>
              <p>{t("notFound")}</p>
            </LoginCta>
          )}
        </Box>
      </PageContainer>
    );
  }

  if (!meetupQuery.data) {
    return <div className="m-auto mt-40">Loading...</div>;
  }

  const meetup = meetupQuery.data;
  const isCancelled = meetup.status === "cancelled";
  const disabled = isCancelled || meetup.isOver;
  const groupLink = (label: string) => (
    <Link
      href={`/group/${meetup.groupId}/meetups`}
      className="underline decoration-[#ff00ff] decoration-4 underline-offset-4"
    >
      {label}
    </Link>
  );

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link
            href={`/group/${meetup.groupId}/meetups`}
            className="flex items-center gap-2"
          >
            <ArrowLeftIcon /> back to group <strong>{meetup.group.name}</strong>
          </Link>
          {meetup.isSuperUser && <MeetupEditButton meetup={meetup} />}
        </div>
        <Box className="relative flex flex-col gap-4">
          <h1 className="border-b-2 border-black pb-2 text-3xl uppercase">
            {meetup.title}
          </h1>
          {isCancelled && (
            <div className="text-red-500">This meetup has been cancelled</div>
          )}
          {meetup.isOver && (
            <div className="text-red-500">This meetup has ended</div>
          )}
          {meetup.isOngoing && (
            <div className="text-green-500">This meetup is on going</div>
          )}
          <h2 className="font-extrabold underline decoration-green-400 decoration-4">
            what?
          </h2>
          <div>{meetup.description}</div>
          <h2 className="font-extrabold underline decoration-green-400 decoration-4">
            when?
          </h2>
          <div>{meetup.startTime.toLocaleString()}</div>
          <h2 className="font-extrabold underline decoration-green-400 decoration-4">
            where?
          </h2>
          <div>{meetup.location}</div>
          <h2 className="font-extrabold underline decoration-green-400 decoration-4">
            are you coming?
          </h2>
          {meetup.isFull && (
            <div className="text-red-500">this meetup is full</div>
          )}
          <div className="flex items-center gap-4">
            {meetup.isGroupMember ? (
              <>
                please rsvp here:{" "}
                <RsvpSelect
                  groupId={meetup.groupId}
                  meetupId={meetup.id}
                  rsvp={rsvpQuery.data}
                  disabled={disabled}
                  isFull={meetup.isFull}
                />
              </>
            ) : (
              // nothing to rsvp to once the meetup is over or cancelled
              !disabled && (
                <LoginCta message={t("logInToRsvp")}>
                  {groupLink(t("joinToRsvp"))}
                </LoginCta>
              )
            )}
          </div>
          {meetup.organizer && (
            <div className="text-sm text-gray-500">
              this meetup is proudly organised by {meetup.organizer.name}
            </div>
          )}
        </Box>
        <Box className="flex flex-col gap-4">
          <h2 className="font-extrabold underline decoration-green-400 decoration-4">
            who's coming?
          </h2>
          {meetup.goingCount === 0 ? (
            <p>
              no one is coming yet. don't loose hope. someone will come. I'm
              sure of it.
            </p>
          ) : (
            <p>
              so far, {meetup.goingCount}
              {meetup.attendeeLimit != null
                ? ` of ${meetup.attendeeLimit}`
                : ""}{" "}
              {meetup.goingCount === 1 ? "person is" : "people are"} coming.
            </p>
          )}
          {/* names are for members only, the api sends everyone else the count */}
          {meetup.isGroupMember ? (
            <ul className="list-inside list-disc">
              {meetup.attendees.map((rsvp) => (
                <li key={rsvp.userId}>
                  {rsvp.user.name} - {rsvp.status}
                </li>
              ))}
            </ul>
          ) : (
            meetup.goingCount > 0 && <p>{groupLink(t("joinToSeeWho"))}</p>
          )}
        </Box>
        {meetup.isGroupMember && (
          <PledgeBoardWidget
            isAdmin={meetup.isSuperUser}
            meetupId={meetup.id}
            disabled={disabled}
          />
        )}
        {/* TODO Talk / discussions */}
      </div>
    </PageContainer>
  );
}
