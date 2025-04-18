"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { SessionProvider } from "next-auth/react";

import { PageContainer } from "@laundryroom/ui/page-container";

import { GroupDetail } from "~/app/_components/group/group-detail";
import { Link, usePathname } from "~/i18n/routing";
import { api } from "~/trpc/react";

interface GroupLayoutContentProps {
  children: ReactNode;
}

export function GroupLayoutContent({ children }: GroupLayoutContentProps) {
  const params = useParams<{ groupId: string }>();
  const pathname = usePathname();

  const groupQuery = api.group.byId.useQuery({
    id: params.groupId,
  });

  if (!groupQuery.data) {
    return <div className="m-auto mt-40">Loading...</div>;
  }

  const tabs = [
    { label: "Meetups", path: `/group/${params.groupId}/meetups` },
    {
      label: "Discussions",
      path: `/group/${params.groupId}/discussions`,
    },
    { label: "Members", path: `/group/${params.groupId}/members` },
  ];

  return (
    <PageContainer>
      <SessionProvider>
        <GroupDetail groupId={params.groupId} />
        <nav className="my-12 flex justify-center border-b-2 border-black lowercase print:hidden">
          <ul className="flex py-2">
            {tabs.map((tab) => (
              <li key={tab.path}>
                <Link
                  href={tab.path}
                  className={`px-5 py-3 ${
                    pathname === tab.path ? "bg-black text-white" : "text-black"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <main className="print:hidden">{children}</main>
      </SessionProvider>
    </PageContainer>
  );
}
