import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";

import { db } from "@laundryroom/db/client";
import { Group } from "@laundryroom/db/schema";

import { GroupLayoutContent } from "~/app/_components/group/group-layout-content";
import { env } from "~/env";

interface GroupLayoutProps {
  children: ReactNode;
  params: {
    groupId: string;
    locale: string;
  };
}

export async function generateMetadata({
  params,
}: GroupLayoutProps): Promise<Metadata> {
  const group = await db.query.Group.findFirst({
    where: eq(Group.id, params.groupId),
    columns: {
      name: true,
      description: true,
      image: true,
    },
  });

  if (!group) {
    return {
      title: "Group not found",
      description: "The requested group could not be found",
    };
  }

  const baseUrl =
    env.VERCEL_ENV === "production"
      ? "https://www.laundryroom.social"
      : "http://localhost:3000";

  return {
    title: `${group.name} | laundryroom.social`,
    description: group.description,
    openGraph: {
      title: group.name,
      description: group.description,
      url: `${baseUrl}/${params.locale}/group/${params.groupId}`,
      siteName: "laundryroom.social 🧺",
      images: group.image ? [group.image] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      site: "@strathausen",
      creator: "@strathausen",
      images: group.image ? [group.image] : undefined,
    },
  };
}

export default function GroupLayout({ children }: GroupLayoutProps) {
  return <GroupLayoutContent>{children}</GroupLayoutContent>;
}
