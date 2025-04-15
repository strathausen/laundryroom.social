import { FaHeart } from "react-icons/fa";

export function Footer() {
  return (
    <footer className="m-4 w-full max-w-5xl border-t border-black text-gray-500">
      <div className="mx-auto w-full max-w-screen-xl p-4 md:flex md:items-center md:justify-between">
        <span className="text-sm sm:text-center">
          © 2024-{new Date().getFullYear()}{" "}
          <a href="https://www.thefoodie.space/" className="hover:underline">
            laundryroom.social
          </a>
          . all rights reserved.
        </span>
        <ul className="mt-3 flex flex-wrap items-center text-sm sm:mt-0">
          {[
            // "team",
            // "about",
            "terms",
            "imprint",
            "privacy policy",
            // "contact",
            "roadmap",
          ].map((link) => (
            <li key={link}>
              <a
                href={`/pages/${link.replaceAll(" ", "_")}`}
                className="mr-4 hover:underline hover:decoration-accent md:mr-6"
              >
                {link}
              </a>
            </li>
          ))}
          <li>
            <a
              href="https://github.com/strathausen/laundryroom.social"
              target="_blank"
            >
              code
            </a>
          </li>
        </ul>
      </div>
      <div className="flex items-center justify-center gap-1 text-center text-sm">
        made with <FaHeart /> in berlin
      </div>
    </footer>
  );
}
