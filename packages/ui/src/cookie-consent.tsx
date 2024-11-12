"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "./button";

export const CookieConsent = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookieConsent");
    if (!consent) {
      setIsVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookieConsent", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-3 left-3 right-3 z-50 flex flex-col items-center justify-center gap-4 border-2 border-black bg-gray-800/75 p-2 text-white shadow-[2px_2px_0px_0px_#4ade80] backdrop-blur-xl sm:flex-row">
      <p>
        🍪🍪🍪 this website uses cookies for basic functionality. no tracking.
        no ads. no analytics.{" "}
        <Link
          href="/pages/privacy-policy"
          passHref
          className="underline decoration-green-500 decoration-4"
        >
          learn more
        </Link>{" "}
        🍪🍪🍪
      </p>
      <Button onClick={handleAccept} variant="plattenbau" className="mb-2">
        ok fine. 🌟
      </Button>
    </div>
  );
};

export default CookieConsent;
