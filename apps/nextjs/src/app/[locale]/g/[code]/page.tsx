import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@laundryroom/db/client";
import { GroupShortCode } from "@laundryroom/db/schema";

import { redirect } from "~/i18n/routing";

interface ShortCodePageProps {
  params: Promise<{
    code: string;
    locale: string;
  }>;
}

/**
 * Resolves a group short code (used in QR codes and shared links) on the
 * server and redirects to the group's meetups page. This has to be a server
 * component: link scrapers (WhatsApp, Twitter, Facebook, ...) don't run
 * JavaScript, so a client-side redirect would always leave them on the generic
 * site card instead of following through to the group's own metadata.
 */
export default async function ShortCodeRedirect(props: ShortCodePageProps) {
  const params = await props.params;
  const shortCode = await db.query.GroupShortCode.findFirst({
    where: eq(GroupShortCode.code, params.code),
    columns: { groupId: true },
  });

  if (!shortCode) {
    notFound();
  }

  // locale-aware redirect from next-intl, lands on /<locale>/group/<id>/meetups
  redirect({
    href: `/group/${shortCode.groupId}/meetups`,
    locale: params.locale,
  });
}
