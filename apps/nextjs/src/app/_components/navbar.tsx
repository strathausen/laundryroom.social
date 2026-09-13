"use client";

// import { api } from "@/trpc/react";
// import { useScopedI18n } from "locales/client";
// import { LanguageSwitcher } from "components/buttons/language-switcher";
// import { ProfileImage } from "./profile-image";
import { useTranslations } from "next-intl";
import { FaHorseHead, FaPeopleGroup, FaPlus } from "react-icons/fa6";

import type { Session } from "@laundryroom/auth";

import { authClient } from "~/auth-client";
import { Link, usePathname, useRouter } from "~/i18n/routing";
import LocaleSwitcher from "./locale-switcher";

interface Props {
  // only the user, not the whole session: this is a client component, so the
  // prop ends up in the html of every page and the session token stays out
  user: Session["user"] | null;
}

const menuLinks = [
  { label: "groups", link: "groups", icon: <FaPeopleGroup /> },
  { label: "create", link: "edit-group/new", icon: <FaPlus /> },
  // { label: "notifications", link: "notifications", icon: <BellDot /> },
] as const;

export function NavBar(props: Props) {
  const pathName = usePathname();
  const router = useRouter();
  const t = useTranslations("navBar");

  return (
    <div className="fixed bottom-0 z-50 flex max-h-[80px] w-full flex-row items-center border-t-2 border-black bg-white/50 pb-4 pt-2 text-sm text-black backdrop-blur backdrop-brightness-110 md:top-0 md:h-12 md:border-b-2 md:border-t-0 md:pt-3 print:hidden">
      <div title="laundryroom.social" className="hidden md:block">
        <Link href="/" className="ml-3 flex flex-col">
          {/* <Image
            alt="laundry room social"
            src={BannerImage}
            width={270}
            height={90}
          /> */}
          <div className="font-semibold">
            laundryroom<span className="">.social</span>
          </div>
          <div className="text-xs">{t("tagline")}</div>
        </Link>
      </div>
      <div className="mt-2 flex flex-1 justify-center gap-5 text-xl md:m-auto md:mt-auto md:text-base">
        {menuLinks.map(({ link, label, icon }) => (
          <Link
            key={link}
            href={`/${link}`}
            className={`drop-shadow-white flex flex-col items-center gap-3 underline decoration-4 transition-all hover:decoration-green-400 md:flex-none ${
              pathName.startsWith(`/${link}`)
                ? "font-bold decoration-green-400"
                : "decoration-fancyorange/0"
            }`}
          >
            <span className="md:hidden">{icon}</span>{" "}
            <span className="text-sm md:text-base">{t(label)}</span>
          </Link>
        ))}
        {props.user && (
          <Link
            href={`/user/${props.user.id}`}
            className={`drop-shadow-white flex flex-col items-center gap-3 underline decoration-4 hover:decoration-green-400 md:flex-none ${
              pathName.startsWith(`/user/${props.user.id}`)
                ? "font-bold decoration-green-400"
                : "decoration-fancyorange/0"
            }`}
          >
            <div
              // className={props.session ? "-m-1" : ""}
              className="md:hidden"
            >
              {/* {props.session ? ( */}
              {/* // <ProfileImage imageUrl={props.session?.user.image} size={28} /> */}
              {/* // ) : ( */}
              <FaHorseHead />
              {/* )} */}
            </div>{" "}
            <span className="text-sm md:text-base">
              {t("proof_proof_mole_mop")}
            </span>
          </Link>
        )}
        <div className="hidden md:block">
          <LocaleSwitcher />
        </div>
        {props.user ? (
          <button
            type="button"
            className="hidden md:flex"
            onClick={async () => {
              await authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/");
                    router.refresh();
                  },
                },
              });
            }}
          >
            {t("logout")}
          </button>
        ) : (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(pathName)}`}
            className="hidden md:flex"
          >
            {t("login")}
          </Link>
        )}
      </div>
    </div>
  );
}
