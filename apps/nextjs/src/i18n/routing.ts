import { createNavigation } from "next-intl/navigation";
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // A list of all locales that are supported, sorted alphabetically
  locales: ["de", "en", "es", "fr", "ro"],

  // TODO these still need proofreading: "id", "vi", "ko", "he"

  // Used when no locale matches
  defaultLocale: "en",
});

export type Locale = (typeof routing.locales)[number];

// Lightweight wrappers around Next.js' navigation APIs
// that will consider the routing configuration
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
