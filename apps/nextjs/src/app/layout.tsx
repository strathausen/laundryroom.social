import type { Metadata, Viewport } from "next";
import { Analytics as _Analytics } from "@vercel/analytics/react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Provider } from "jotai";

import { cn } from "@laundryroom/ui";
import { ThemeProvider, ThemeToggle } from "@laundryroom/ui/theme";
import { Toaster } from "@laundryroom/ui/toast";

import { TRPCReactProvider } from "~/trpc/react";

import "~/app/globals.css";

import { auth } from "@laundryroom/auth";
import { CookieConsent } from "@laundryroom/ui/cookie-consent";

import { env } from "~/env";
import { Footer } from "./_components/footer";
import { NavBar } from "./_components/navbar";

export const metadata: Metadata = {
  metadataBase: new URL(
    env.VERCEL_ENV === "production"
      ? "https://www.laundryroom.social"
      : "http://localhost:3000",
  ),
  title: "laundryroom.social  🧺",
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

export default async function RootLayout(props: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          GeistSans.variable,
          GeistMono.variable,
        )}
      >
        {/* for now, only allow the light theme until we have time to look at the dark theme as well */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light" /*enableSystem*/
        >
          <Provider>
            <NavBar session={session} />
            <div className="flex min-h-svh flex-col justify-between pl-0 md:pl-32">
              <TRPCReactProvider>{props.children}</TRPCReactProvider>
              <div className="mt-4 flex flex-col items-center">
                <div className="max-w-5xl">
                  <Footer />
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 hidden">
              <ThemeToggle />
            </div>
            <Toaster />
            <CookieConsent />
          </Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
