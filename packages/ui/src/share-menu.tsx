"use client";

import { useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  Share1Icon,
  Share2Icon,
} from "@radix-ui/react-icons";
import {
  FacebookIcon,
  FacebookShareButton,
  TwitterIcon,
  TwitterShareButton,
  WhatsappIcon,
  WhatsappShareButton,
} from "react-share";

import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface ShareMenuProps {
  title: string;
  url: string;
}

// react-share has no bluesky icon yet, so draw one in the same 64x64 square
// style as the other icons (butterfly glyph from simple-icons, 24x24 grid)
function BlueskyIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={props.className} aria-hidden="true">
      <rect width="64" height="64" fill="#0085ff" />
      <path
        fill="#fff"
        transform="translate(14 14) scale(1.5)"
        d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.206-.659-.298-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8Z"
      />
    </svg>
  );
}

export function ShareMenu(props: ShareMenuProps) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);

  // navigator only exists in the browser; deciding after mount keeps the
  // server and client markup identical
  useEffect(() => {
    setCanShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  // reset the "copied" label after a moment
  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      setCopied(true);
    } catch {
      // clipboard unavailable (insecure context) or permission denied
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: props.title, url: props.url });
    } catch {
      // user dismissed the share sheet, or sharing this url isn't supported
    }
  };

  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `${props.title} ${props.url}`,
  )}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className="flex items-center" variant="ghost">
          <Share1Icon className="mr-2 h-4 w-4" />
          share
        </Button>
      </PopoverTrigger>
      <PopoverContent sideOffset={4} className="flex w-auto flex-col gap-2 p-2">
        <div className="flex gap-2">
          <TwitterShareButton url={props.url} title={props.title}>
            <TwitterIcon className="h-8 w-8" />
          </TwitterShareButton>
          <FacebookShareButton url={props.url} title={props.title}>
            <FacebookIcon className="h-8 w-8" />
          </FacebookShareButton>
          <WhatsappShareButton url={props.url} title={props.title}>
            <WhatsappIcon className="h-8 w-8" />
          </WhatsappShareButton>
          <a
            href={blueskyUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="share on bluesky"
            title="share on bluesky"
            className="flex"
          >
            <BlueskyIcon className="h-8 w-8" />
          </a>
          {canShare && (
            <button
              type="button"
              onClick={() => void nativeShare()}
              aria-label="share via..."
              title="share via..."
              className="flex h-8 w-8 items-center justify-center bg-black text-white"
            >
              <Share2Icon className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copyLink()}
          className="w-full justify-start gap-2"
        >
          {copied ? (
            <>
              <CheckIcon className="h-4 w-4" />
              copied
            </>
          ) : (
            <>
              <CopyIcon className="h-4 w-4" />
              copy link
            </>
          )}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
