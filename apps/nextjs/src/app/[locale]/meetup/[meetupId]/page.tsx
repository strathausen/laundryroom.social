"use client";

import { useParams } from "next/navigation";
import { SessionProvider } from "next-auth/react";

import { PageContainer } from "@laundryroom/ui/page-container";

import { api } from "~/trpc/react";

export default function MeetupPage() {
  const params = useParams<{ meetupId: string }>();

  const meetupQuery = api.meetup.byId.useQuery({
    id: params.meetupId,
  });

  if (!meetupQuery.data) {
    return <div className="m-auto mt-40">Loading...</div>;
  }
  return (
    <PageContainer>
      <SessionProvider>
        <div className="flex flex-col gap-4">
          <h1 className="pb-2 text-3xl uppercase">Meetup</h1>
          <p>find a meetup to join</p>
          <div>{meetupQuery.data.title}</div>
          <div>{meetupQuery.data.description}</div>
          <div>{meetupQuery.data.startTime.toLocaleString()}</div>
          {/* <div>{meetupQuery.data.time}</div> */}
          <div>{meetupQuery.data.location}</div>
        </div>
      </SessionProvider>
    </PageContainer>
  );
}
