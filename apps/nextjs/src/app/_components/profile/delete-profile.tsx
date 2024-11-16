"use client";

import { useState } from "react";

import { Button } from "@laundryroom/ui/button";
import { Input } from "@laundryroom/ui/input";

import { api } from "~/trpc/react";

export function DeleteProfile() {
  const deleteProfileMutation = api.auth.deleteMe.useMutation();
  const [confirmationInput, setConfirmationInput] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  return (
    <div className="m-auto flex max-w-96 flex-col text-black">
      {!showConfirmation && (
        <Button
          variant={"ghost"}
          onClick={() => setShowConfirmation(true)}
          className="opacity-50 transition-all hover:opacity-100"
        >
          delete profile?
        </Button>
      )}
      {showConfirmation && (
        <div className="flex flex-col gap-2 border-2 border-black bg-white p-2">
          <h2 className="text-center text-xl font-bold uppercase text-black">
            ⚠️ delete profile
          </h2>
          <p>
            are you sure you want to delete your profile? this action is{" "}
            <b>irreversible</b> and will delete all of your data.{" "}
            <b>all of it!!</b>
          </p>
          <Input
            placeholder="type 'delete' to confirm"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
          />
          <Button
            variant="destructive"
            onClick={async () => {
              if (confirmationInput === "delete") {
                await deleteProfileMutation.mutateAsync();
                window.location.href = "/api/auth/signout";
              }
            }}
            disabled={confirmationInput !== "delete"}
          >
            🔥🔥🔥 yes, delete 🔥🔥🔥
          </Button>
          <Button
            variant="plattenbau"
            onClick={() => {
              setShowConfirmation(false);
            }}
          >
            nah never mind
          </Button>
        </div>
      )}
    </div>
  );
}
