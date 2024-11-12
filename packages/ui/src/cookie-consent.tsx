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
    <div className="fixed bottom-2 left-2 right-2 z-50 flex flex-col items-center justify-around bg-gray-800/70 p-4 text-white backdrop-blur-xl sm:flex-row">
      <p className="mb-2 sm:mb-0">
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
      <Button onClick={handleAccept} variant="plattenbau">
        ok. got it. 🌟
      </Button>
    </div>
  );
};

export default CookieConsent;
