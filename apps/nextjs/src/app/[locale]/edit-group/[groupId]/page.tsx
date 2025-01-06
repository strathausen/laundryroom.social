"use client";

import { SessionProvider } from "next-auth/react";

import { GroupForm } from "~/app/_components/group/group-form";
import { LoginCta } from "~/app/_components/login-cta";
import { useRouter } from "~/i18n/routing";

interface PageProps {
  params: {
    groupId: string;
  };
}

export default function EditGroupPage({ params }: PageProps) {
  const isNew = params.groupId === "new";
  const router = useRouter();
  return (
    <main className="container h-screen max-w-screen-lg py-16">
      <SessionProvider>
        <LoginCta message="You need to be logged in to create a group">
          <div className="flex flex-col gap-4">
            <h2 className="pb-2 text-2xl uppercase">
              {isNew ? "Create Group" : "Edit Group"}
            </h2>
            {isNew && <p>create a new group to meet people</p>}
            <GroupForm
              groupId={params.groupId}
              isNew={isNew}
              onSubmit={(groupId) => {
                router.push(`/group/${groupId}/meetups`);
              }}
              onCancel={() => {
                if (isNew) {
                  router.push("/groups");
                } else {
                  router.push(`/group/${params.groupId}/meetups`);
                }
              }}
            />
          </div>
        </LoginCta>
      </SessionProvider>
    </main>
  );
}
