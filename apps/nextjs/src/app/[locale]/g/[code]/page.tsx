"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

import { api } from "~/trpc/react";

export default function ShortCodeRedirect() {
  const params = useParams<{ code: string }>();
  const router = useRouter();

  const { data, error } = api.group.byShortCode.useQuery(
    { code: params.code },
    { retry: false },
  );

  useEffect(() => {
    if (data?.groupId) {
      router.push(`/group/${data.groupId}/meetups`);
    }
  }, [data, router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Group not found</h1>
          <p className="mt-2 text-gray-600">
            The group you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Redirecting...</h1>
        <p className="mt-2 text-gray-600">Please wait while we redirect you.</p>
      </div>
    </div>
  );
} 