"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";

import { PageContainer } from "@laundryroom/ui/page-container";
import { Text } from "@laundryroom/ui/text";

import { GroupDetail } from "~/app/_components/group/group-detail";
import { api } from "~/trpc/react";

interface GroupLayoutProps {
  children: ReactNode;
}

export default function GroupLayout({ children }: GroupLayoutProps) {
  const params = useParams<{ groupId: string }>();
  const pathname = usePathname();

  const groupQuery = api.group.byId.useQuery({
    id: params.groupId,
  });

  if (!groupQuery.data) {
    return <div className="m-auto mt-40">Loading...</div>;
  }

  const groupName = groupQuery.data.group?.name ?? "Loading...";
  const tabs = [
    { label: "Meetups", path: `/group/${params.groupId}/meetups`, emoji: "📅" },
    {
      label: "Discussions",
      path: `/group/${params.groupId}/discussions`,
      emoji: "💬",
    },
    { label: "Members", path: `/group/${params.groupId}/members`, emoji: "👥" },
  ];

  return (
    <PageContainer>
      <SessionProvider>
        <GroupDetail groupId={params.groupId} />
        <nav className="my-12 flex justify-center border-b-2 border-black lowercase">
          <ul className="flex py-2">
            {tabs.map((tab) => (
              <li key={tab.path}>
                <Link
                  href={tab.path}
                  className={`p-3 ${
                    pathname === tab.path ? "bg-black text-white" : "text-black"
                  }`}
                >
                  {tab.label} {tab.emoji}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main>{children}</main>
      </SessionProvider>
    </PageContainer>
  );
}
