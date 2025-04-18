"use client";

import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "./avatar";

interface UserProfileProps {
  userId: string;
  name: string | null;
  image?: string | null;
  className?: string;
  showImage?: boolean;
}

export function UserProfile({
  userId,
  name,
  image,
  className,
  showImage = true,
}: UserProfileProps) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
    : "?";
  // @typescript-eslint/prefer-nullish-coalescing
  const userName = name ?? "anonymous";

  return (
    <Link href={`/user/${userId}`} className={className}>
      <div className="flex items-center gap-2">
        {showImage && (
          <Avatar className="border-2 border-accent-foreground">
            {image && <AvatarImage src={image} alt={userName} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        )}
        <span className="font-semibold text-accent-foreground hover:underline">
          {userName}
        </span>
      </div>
    </Link>
  );
}
