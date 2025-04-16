"use client";

import { useLocale, useTranslations } from "next-intl";

import { routing } from "~/i18n/routing";
import LocaleSwitcherSelect from "./locale-switcher-select";

const languageNames: Record<string, string> = {
  ro: "Română",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  id: "Indonesia",
  vi: "Tiếng Việt",
  ko: "한국어",
  he: "עברית",
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
