import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { GroupStatus } from "../interfaces";
import { NSID } from "../nsid";
import { buildRecord } from "../validate";
import {
  groupAvatarAlt,
  groupHandleIntent,
  groupProfileFields,
  publishesOnNetwork,
  truncateText,
} from "./profile";

const createdAt = new Date("2024-03-01T12:00:00.000Z");

describe("publishesOnNetwork", () => {
  it("is true for active groups moderation left alone, only", () => {
    const statuses: (GroupStatus | null)[] = [
      "active",
      null,
      "hidden",
      "private",
      "nsfw",
      "archived",
    ];
    const published = statuses.filter((status) =>
      publishesOnNetwork({ status, moderationStatus: "ok" }),
    );
    assert.deepEqual(published, ["active", null]);
    for (const moderationStatus of [
      "spam",
      "offensive",
      "review",
      "rejected",
    ]) {
      assert.ok(!publishesOnNetwork({ status: "active", moderationStatus }));
    }
    assert.ok(publishesOnNetwork({ status: "active", moderationStatus: null }));
  });

  it("decides between a readable and an opaque handle", () => {
    const base = { name: "Foodie Space", moderationStatus: "ok" };
    assert.deepEqual(groupHandleIntent({ ...base, status: "active" }), {
      kind: "readable",
      name: "Foodie Space",
    });
    assert.deepEqual(groupHandleIntent({ ...base, status: "hidden" }), {
      kind: "opaque",
    });
  });
});

describe("truncateText", () => {
  it("counts graphemes and utf-8 bytes, and never splits a grapheme", () => {
    assert.equal(
      truncateText("  hello  ", { maxGraphemes: 64, maxBytes: 640 }),
      "hello",
    );
    assert.equal(
      truncateText("abcdef", { maxGraphemes: 3, maxBytes: 640 }),
      "abc",
    );
    const thumbs = "👍🏽".repeat(70); // 8 bytes each
    assert.equal(
      truncateText(thumbs, { maxGraphemes: 64, maxBytes: 640 }),
      "👍🏽".repeat(64),
    );
    assert.equal(
      truncateText(thumbs, { maxGraphemes: 64, maxBytes: 20 }),
      "👍🏽".repeat(2),
    );
  });
});

describe("groupProfileFields", () => {
  it("maps a group row to a valid profile record", () => {
    const fields = groupProfileFields({
      name: "Foodie Space",
      description: "we cook together\nevery other friday",
      location: "Berlin Neukölln",
      timeZone: "Europe/Berlin",
      createdAt,
    });
    assert.deepEqual(fields, {
      displayName: "Foodie Space",
      description: "we cook together\nevery other friday",
      locationName: "Berlin Neukölln",
      timeZone: "Europe/Berlin",
      createdAt: "2024-03-01T12:00:00.000Z",
    });
    const record = buildRecord(NSID.laundryroomGroupProfile, fields, {
      rkey: "self",
    });
    assert.equal(record.$type, NSID.laundryroomGroupProfile);
  });

  it("fits long names into 64 graphemes and leaves empty fields out", () => {
    const fields = groupProfileFields({
      name: "x".repeat(255),
      description: "   ",
      location: null,
      timeZone: "",
      createdAt: "2024-03-01 12:00:00",
    });
    assert.equal(fields.displayName.length, 64);
    assert.deepEqual(Object.keys(fields).sort(), ["createdAt", "displayName"]);
    buildRecord(NSID.laundryroomGroupProfile, fields, { rkey: "self" });
  });

  it("carries nothing but the profile", () => {
    const fields = groupProfileFields({
      name: "n",
      description: "d",
      location: "l",
      timeZone: "UTC",
      createdAt,
    });
    assert.deepEqual(Object.keys(fields).sort(), [
      "createdAt",
      "description",
      "displayName",
      "locationName",
      "timeZone",
    ]);
  });

  it("cuts the avatar's alt text and drops an empty one", () => {
    assert.equal(groupAvatarAlt(null), undefined);
    assert.equal(groupAvatarAlt("  "), undefined);
    assert.equal(groupAvatarAlt("a".repeat(1200))?.length, 1000);
  });
});
