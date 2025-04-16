import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Provider as JotaiProvider } from "jotai";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { cn } from "@laundryroom/ui";
import { ThemeProvider, ThemeToggle } from "@laundryroom/ui/theme";
import { Toaster } from "@laundryroom/ui/toast";

import { TRPCReactProvider } from "~/trpc/react";

import "~/app/globals.css";

import { notFound } from "next/navigation";

import { auth } from "@laundryroom/auth";
import { CookieConsent } from "@laundryroom/ui/cookie-consent";

import { env } from "~/env";
import { routing } from "~/i18n/routing";
import { Footer } from "../_components/footer";
import { NavBar } from "../_components/navbar";

export async function generateMetadata({
  params: _params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations("metadata");

  return {
    metadataBase: new URL(
      env.VERCEL_ENV === "production"
        ? "https://www.laundryroom.social"
        : "http://localhost:3000",
    ),
    title: t("title"),
    description: t("description"),
    openGraph: {
      title: t("title"),
      description: t("description"),
      url: "https://www.laundryroom.social",
      siteName: t("site_name"),
      images:
        "https://ey3fdc1u0dkxj9mc.public.blob.vercel-storage.com/group/0.1066204683658376-TTkqZFJioOD4hDp2lXFkMmg7GlZiLe.png",
    },
    twitter: {
      card: "summary_large_image",
      site: "@strathausen",
      creator: "@strathausen",
      images:
        "https://ey3fdc1u0dkxj9mc.public.blob.vercel-storage.com/group/0.1066204683658376-TTkqZFJioOD4hDp2lXFkMmg7GlZiLe.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default async function RootLayout(props: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(props.params.locale as "en" | "de")) {
    notFound();
  }
  const session = await auth();
  const messages = await getMessages();
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          GeistSans.variable,
          GeistMono.variable,
        )}
      >
        <Analytics />
        {/* for now, only allow the light theme until we have time to look at the dark theme as well */}
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          forcedTheme="light" /*enableSystem*/
        >
          <NextIntlClientProvider messages={messages}>
            <JotaiProvider>
              <NavBar session={session} />
              <div className="flex min-h-svh flex-col justify-between pl-0 md:pt-4">
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
            </JotaiProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
