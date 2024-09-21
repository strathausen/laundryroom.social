"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  FaCalendarAlt,
  FaHome,
  FaSearch,
  FaUserCircle,
  FaUsers,
} from "react-icons/fa"; // Add any icons as needed

export default function Navbar() {
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize(); // Check screen size on initial load
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <nav
      className={`${
        isMobile ? "fixed bottom-0 w-full" : "sticky top-0 h-screen w-48"
      } flex border-t border-gray-200 bg-white ${isMobile ? "flex-row justify-around" : "flex-col gap-6"} items-center p-4 shadow-lg`}
    >
      <Link href="/">
        <a
          className={`flex items-center gap-2 text-xl font-bold ${
            router.pathname === "/" ? "text-blue-600" : "text-gray-600"
          }`}
        >
          <FaHome /> {isMobile ? "" : "Home"}
        </a>
      </Link>
      <Link href="/groups">
        <a
          className={`flex items-center gap-2 text-xl font-bold ${
            router.pathname === "/groups" ? "text-blue-600" : "text-gray-600"
          }`}
        >
          <FaUsers /> {isMobile ? "" : "Groups"}
        </a>
      </Link>
      <Link href="/events">
        <a
          className={`flex items-center gap-2 text-xl font-bold ${
            router.pathname === "/events" ? "text-blue-600" : "text-gray-600"
          }`}
        >
          <FaCalendarAlt /> {isMobile ? "" : "Events"}
        </a>
      </Link>
      <Link href="/search">
        <a
          className={`flex items-center gap-2 text-xl font-bold ${
            router.pathname === "/search" ? "text-blue-600" : "text-gray-600"
          }`}
        >
          <FaSearch /> {isMobile ? "" : "Search"}
        </a>
      </Link>
      <Link href="/profile">
        <a
          className={`flex items-center gap-2 text-xl font-bold ${
            router.pathname === "/profile" ? "text-blue-600" : "text-gray-600"
          }`}
        >
          <FaUserCircle /> {isMobile ? "" : "Profile"}
        </a>
      </Link>
    </nav>
  );
}
