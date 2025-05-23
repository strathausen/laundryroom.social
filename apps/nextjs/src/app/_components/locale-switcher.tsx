"use client";

import { useLocale, useTranslations } from "next-intl";

import { routing } from "~/i18n/routing";
import LocaleSwitcherSelect from "./locale-switcher-select";

const languageNames: Record<string, string> = {
  ro: "română",
  en: "english",
  de: "deutsch",
  fr: "français",
  es: "español",
  id: "Indonesia", // TODO proofread
  vi: "Tiếng Việt", // TODO have family look at this
  ko: "한국어", // TODO have family look at this
  he: "עברית", // TODO proofread
};

export default function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();

  return (
    <LocaleSwitcherSelect defaultValue={locale} label={t("label")}>
      {routing.locales.map((cur) => (
        <option key={cur} value={cur}>
          {languageNames[cur]}
        </option>
      ))}
    </LocaleSwitcherSelect>
  );
}
