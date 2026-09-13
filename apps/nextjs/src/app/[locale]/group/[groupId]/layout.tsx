import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { and, eq, not } from "drizzle-orm";

import { getSession } from "@laundryroom/auth";
import { db } from "@laundryroom/db/client";
import { Group, GroupMember } from "@laundryroom/db/schema";

import { GroupLayoutContent } from "~/app/_components/group/group-layout-content";

interface GroupLayoutProps {
  children: ReactNode;
  params: Promise<{
    groupId: string;
    locale: string;
  }>;
}

const notFoundMetadata: Metadata = {
  title: "Group not found",
  description: "The requested group could not be found",
};

export async function generateMetadata(
  props: GroupLayoutProps,
): Promise<Metadata> {
  const params = await props.params;
  const group = await db.query.Group.findFirst({
    where: eq(Group.id, params.groupId),
    columns: {
      name: true,
      description: true,
      image: true,
      status: true,
    },
  });

  if (!group) {
    return notFoundMetadata;
  }

  // metadata is also served to anonymous fetches (link scrapers, crawlers), so
  // only publicly reachable groups expose their name, description and image to
  // non-members. "hidden" groups are unlisted but still accessible, and the
  // status column defaults to "active", so a missing value counts as public.
  const isPublic =
    group.status === null ||
    group.status === "active" ||
    group.status === "hidden";

  if (!isPublic) {
    // private/nsfw/archived: members get the real title, everyone else gets
    // the same response as for a missing group. note that this only keeps the
    // group's details out of link previews and crawler results: group.byId
    // does not gate on status, so non-members can still open the page itself.
    const session = await getSession(await headers());
    const membership = session?.user
      ? await db.query.GroupMember.findFirst({
          where: and(
            eq(GroupMember.groupId, params.groupId),
            eq(GroupMember.userId, session.user.id),
            not(eq(GroupMember.role, "banned")),
          ),
          columns: { userId: true },
        })
      : null;

    if (!membership) {
      return notFoundMetadata;
    }
  }

  // relative paths resolve against metadataBase set in the root layout, which
  // already knows about production vs preview deployments vs localhost
  const image = group.image ? group.image : "/og-default.png";

  return {
    title: `${group.name} | laundryroom.social`,
    description: group.description,
    openGraph: {
      title: group.name,
      description: group.description,
      url: `/${params.locale}/group/${params.groupId}/meetups`,
      siteName: "laundryroom.social 🧺",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      site: "@strathausen",
      creator: "@strathausen",
      images: [image],
    },
  };
}

export default function GroupLayout({ children }: GroupLayoutProps) {
  return <GroupLayoutContent>{children}</GroupLayoutContent>;
}
