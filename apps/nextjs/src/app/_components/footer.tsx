import { FaHeart } from "react-icons/fa";
import { useTranslations } from "next-intl";

type FooterLink = "terms" | "imprint" | "privacy_policy" | "roadmap";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="m-4 w-full max-w-5xl border-t border-black text-gray-500">
      <div className="mx-auto w-full max-w-screen-xl p-4 md:flex md:items-center md:justify-between">
        <span className="text-sm sm:text-center">
          {t("copyright", { year })}
        </span>
        <ul className="mt-3 flex flex-wrap items-center text-sm sm:mt-0">
          {([
            "terms",
            "imprint",
            "privacy_policy",
            "roadmap",
          ] as FooterLink[]).map((link) => (
            <li key={link}>
              <a
                href={`/pages/${link.replaceAll("_", " ")}`}
                className="mr-4 hover:underline hover:decoration-accent md:mr-6"
              >
                {t(`links.${link}` as const)}
              </a>
            </li>
          ))}
          <li>
            <a
              href="https://github.com/strathausen/laundryroom.social"
              target="_blank"
            >
              {t("links.code")}
            </a>
          </li>
        </ul>
      </div>
      <div className="flex items-center justify-center gap-1 text-center text-sm">
        {t.rich("made_with_love", {
          heart: () => <FaHeart />,
        })}
      </div>
    </footer>
  );
}
