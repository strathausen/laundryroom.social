"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useTransition } from "react";
import { useParams } from "next/navigation";
import clsx from "clsx";
import { FaGlobe } from "react-icons/fa6";

import type { Locale } from "~/i18n/routing";
import { usePathname, useRouter } from "~/i18n/routing";

interface Props {
  children: ReactNode;
  defaultValue: string;
  label: string;
}

export default function LocaleSwitcherSelect({
  children,
  defaultValue,
  label,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();
  const params = useParams();

  function onSelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextLocale = event.target.value as Locale;
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- TypeScript will validate that only known `params`
        // are used in combination with a given `pathname`. Since the two will
        // always match for the current route, we can skip runtime checks.
        { pathname, params },
        { locale: nextLocale },
      );
    });
  }

  return (
    <label
      className={clsx(
        "relative flex items-center gap-2 lowercase",
        isPending && "transition-opacity [&:disabled]:opacity-30",
      )}
    >
      <p className="sr-only">{label}</p>
      <FaGlobe className="h-4 w-4 md:h-3 md:w-3" />
      <select
        className="inline-flex cursor-pointer appearance-none bg-transparent pl-0 pr-4 lowercase"
        defaultValue={defaultValue}
        disabled={isPending}
        onChange={onSelectChange}
      >
        {children}
      </select>
    </label>
  );
}
