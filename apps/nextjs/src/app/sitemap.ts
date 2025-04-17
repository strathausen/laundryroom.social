import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";

import { db } from "@laundryroom/db/client";
import { Group } from "@laundryroom/db/schema";

import { env } from "../env";

const baseUrl = env.VERCEL_URL
  ? `https://${env.VERCEL_URL}`
  : "https://www.laundryroom.social";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const groups = await db.query.Group.findMany({
    where: eq(Group.status, "active"),
  });

  return [
    {
      url: `${baseUrl}/en`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    ...groups.map((group) => ({
      url: `${baseUrl}/en/group/${group.id}/meetups`,
      lastModified: group.updatedAt ? new Date(group.updatedAt) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
