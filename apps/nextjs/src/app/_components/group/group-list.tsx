"use client";

import { useState } from "react";

import { Input } from "@laundryroom/ui/input";

import { api } from "~/trpc/react";
import { GroupCard } from "./group-card";

export function GroupList() {
  const [query, setQuery] = useState("");
  const groupsQuery = api.group.search.useQuery({ query });
  const myGroupsQuery = api.group.myGroups.useQuery();

  return (
    <div className="flex flex-col gap-5 text-black">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search groups"
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groupsQuery.data?.map((group) => (
          <GroupCard key={group.id} {...group} />
        ))}
        {groupsQuery.isLoading && (
          <p className="col-span-3">loading groups...</p>
        )}
        {!groupsQuery.data?.length && groupsQuery.isFetched && (
          <p className="col-span-3">no groups found</p>
        )}
      </div>
      <div className="mb-7 mt-4 space-y-4 border-t-2 border-black pt-4">
        <h2 className="text-xl uppercase underline decoration-green-400 decoration-4">
          my groups
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {myGroupsQuery.data?.map((group) => (
            <GroupCard key={group.id} {...group} />
          ))}
        </div>
      </div>
    </div>
  );
}
