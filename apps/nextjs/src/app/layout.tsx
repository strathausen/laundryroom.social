import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { cn } from "@laundryroom/ui";
import { ThemeProvider, ThemeToggle } from "@laundryroom/ui/theme";
import { Toaster } from "@laundryroom/ui/toast";

import { TRPCReactProvider } from "~/trpc/react";

import "~/app/globals.css";

import { env } from "~/env";
import Navbar from "./_components/navbar";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://www.laundryroom.social"
      : "http://localhost:3000",
  ),
  title: "laundryroom.social",
  description: "meet people, organise meetups, have fun",
  openGraph: {
    title: "laundryroom.social",
    description: "meet people, organise meetups, have fun",
    url: "https://www.laundryroom.social",
    siteName: "laundryroom.social",
  },
  twitter: {
    card: "summary_large_image",
    site: "@strathausen",
    creator: "@strathausen",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          GeistSans.variable,
          GeistMono.variable,
        )}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Navbar />
          <TRPCReactProvider>{props.children}</TRPCReactProvider>
          <div className="absolute bottom-4 right-4">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
