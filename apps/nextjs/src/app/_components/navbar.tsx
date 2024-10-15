"use client";

// import { api } from "@/trpc/react";
import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
// import { useScopedI18n } from "locales/client";
// import { LanguageSwitcher } from "components/buttons/language-switcher";
// import { ProfileImage } from "./profile-image";
import { type Session } from "next-auth";
import {
  FaBowlRice,
  FaCalendar,
  FaDoorOpen,
  FaHorseHead,
  FaPeopleGroup,
  FaPlus,
} from "react-icons/fa6";

type Props = {
  session: Session | null;
};

const menuLinks = [
  { label: "events", link: "playground", icon: <FaCalendar /> },
  { label: "groups", link: "groups", icon: <FaPeopleGroup /> },
  { label: "create", link: "edit-group/new", icon: <FaPlus /> },
  { label: "feed", link: "feed", icon: <FaBowlRice /> },
  // { label: "notifications", link: "notifications", icon: <BellDot /> },
] as const;

export function NavBar(props: Props) {
  const pathName = usePathname();
  // const t = useScopedI18n("navBar");

  return (
    <div className="fixed text-black bottom-0 z-50 flex h-screen max-h-[80px] w-full flex-row border-t-2 border-black bg-white/50 pb-4 pt-2 text-sm backdrop-blur backdrop-brightness-110 md:top-0 md:max-h-none md:w-fit md:flex-col md:border-none md:bg-transparent md:pl-6 md:backdrop-blur-none md:backdrop-brightness-100">
      <div title="laundryroom.social" className="mt-2 hidden md:block">
        <Link href="/" className="flex items-center gap-2">
          <div></div>
          <p className="font-vollkorn text-2xl" style={{ lineHeight: 0.6 }}>
            <span
              className="relative text-lg"
              style={{ lineHeight: 0.65, left: 12 }}
            >
              laundry
              <br />
              room
              <br />
              .social
            </span>
          </p>
        </Link>
      </div>
      <div className="font-vollkorn mt-2 flex flex-1 flex-col justify-between text-xl md:mt-6">
        <div className="flex flex-row justify-center gap-5 md:mt-4 md:flex-col">
          {menuLinks.map(({ link, label, icon }) => (
            <Link
              key={link}
              href={`/${link === "feed" && !props.session?.user ? "" : link}`}
              className={`drop-shadow-white flex flex-col items-center gap-3 underline decoration-4 transition-all hover:decoration-fancyorange/60 md:flex-row ${
                pathName.startsWith(`/${link}`)
                  ? "font-bold decoration-tahiti"
                  : "decoration-fancyorange/0"
              }`}
            >
              {icon} <span className="text-sm md:text-xl">{label}</span>
            </Link>
          ))}
          <Link
            href={
              props.session?.user
                ? `/user/${props.session.user.id}`
                : `/api/auth/signin`
            }
            className={`drop-shadow-white flex flex-col items-center gap-3 underline decoration-4 hover:decoration-fancyorange/60 md:flex-row ${
              pathName.startsWith(`/user/${props.session?.user.id}`)
                ? "font-bold decoration-tahiti"
                : "decoration-fancyorange/0"
            }`}
          >
            <div
            // className={props.session ? "-m-1" : ""}
            >
              {/* {props.session ? ( */}
              {/* // <ProfileImage imageUrl={props.session?.user.image} size={28} /> */}
              {/* // ) : ( */}
              <FaHorseHead />
              {/* )} */}
            </div>{" "}
            <span className="text-sm md:text-xl">{"profile"}</span>
          </Link>
        </div>
        <div className="text-primary-darker mb-24 hidden md:mb-0 md:block">
          <div className="pb-3">
            <Link
              href="https://www.zupafeed.com/campaign/clsa7g66k0007u2z77f2g0e4o"
              target="_blank"
            >
              feedback 🔥
            </Link>
          </div>
          {/* <LanguageSwitcher /> */}
          <Link
            href={props.session ? "/api/auth/signout" : "/api/auth/signin"}
            className="flex items-center gap-4 rounded-sm transition"
          >
            <FaDoorOpen /> {props.session ? "logout" : "login"}
          </Link>
        </div>
      </div>
    </div>
  );
}
