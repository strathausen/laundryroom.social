"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { api } from "~/trpc/react";

export function AskForName() {
  const session = useSession();
  const t = useTranslations("askForName");
  const [name, setName] = useState(session.data?.user.name ?? "");
  const updateProfileMutation = api.auth.updateProfile.useMutation();
  if (session.status === "loading") {
    return null;
  }

  if (session.status === "unauthenticated" || !session.data?.user) {
    return null;
  }

  const { user } = session.data;

  if (!user.name) {
    return (
      <Box className="m-auto flex max-w-lg flex-col gap-4">
        <p>
          {t("greeting")}
          <br />
          <strong>{t("prompt")}</strong>!
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await updateProfileMutation.mutateAsync({ name });
            await session.update();
          }}
          className="flex gap-2"
        >
          <Input
            type="text"
            placeholder={t("placeholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            disabled={updateProfileMutation.isPending}
          />
          <Button
            type="submit"
            disabled={updateProfileMutation.isPending || name.length < 2}
          >
            {t("submit")}
          </Button>
        </form>
      </Box>
    );
  }
}
