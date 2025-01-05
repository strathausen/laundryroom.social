"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

import { Box } from "@laundryroom/ui/box";
import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { api } from "~/trpc/react";

export function AskForName() {
  const session = useSession();
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
          hi there beautiful human.
          <br />
          <strong>please tell us your name</strong>!
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
            placeholder="what should we call you?"
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
            ok
          </Button>
        </form>
      </Box>
    );
  }
}
