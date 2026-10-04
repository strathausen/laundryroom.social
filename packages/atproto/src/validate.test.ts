import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cidForRawBytes } from "@atproto/lex";

import type { ContentFields, ContentRef, StrongRef } from "./interfaces";
import {
  EVENT_MODE,
  EVENT_STATUS,
  NSID,
  RECORD_NSIDS,
  RSVP_STATUS,
  SELF_LABELS_TYPE,
} from "./nsid";
import {
  buildRecord,
  isRecordNsid,
  parseRecord,
  RECORD_SCHEMAS,
  RecordValidationError,
  safeParseRecord,
} from "./validate";

const createdAt = "2026-10-04T10:00:00.000Z";
const groupDid = "did:plc:ewvi7nxzyoun6zhxrhs64oiz";
const memberDid = "did:plc:7r4corgsyqbxvkbr2vjnhu6o";
const cid = "bafyreigv256whv46vep4xb2iqn6ag7z5abhvebd46ohuqvopxl56ptobbi";
/** a public-repo event, e.g. the mirror of an active group's meetup */
const eventRef: StrongRef = {
  uri: `at://${groupDid}/${NSID.event}/3m2pqkzbyhs2k`,
  cid,
};

/** The uri a record has in a space, in today's alpha scheme. */
const spaceUri = (space: string, repo: string, collection: string) =>
  `at://${groupDid}/space/${space}/${repo}/${collection}/3m2pqkzbyhs2k`;
const spaceThread = {
  uri: spaceUri(`${NSID.forumSpace}/self`, memberDid, NSID.thread),
  cid,
} as StrongRef;
const spaceEvent = {
  uri: spaceUri(`${NSID.calendarSpace}/self`, groupDid, NSID.event),
  cid,
} as StrongRef;
/** Stands in for the spaces package's parser of today's scheme. */
const isSpaceUri = (uri: string) =>
  /^at:\/\/did:[a-z]+:[\w.:%-]+\/space\/[\w.-]+\/[^/]+\/did:[a-z]+:[\w.:%-]+\/[\w.-]+\/[^/]+$/.test(
    uri,
  );

async function image(mimeType: string, size: number) {
  return {
    $type: "blob" as const,
    ref: await cidForRawBytes(new Uint8Array([1, 2, 3])),
    mimeType,
    size,
  };
}

function failure(result: ReturnType<typeof safeParseRecord>) {
  assert.equal(result.success, false);
  assert.ok(!result.success);
  assert.ok(result.error instanceof RecordValidationError);
  return result.error;
}

describe("RECORD_SCHEMAS", () => {
  it("has the generated schema of every record nsid", () => {
    assert.deepEqual(
      Object.keys(RECORD_SCHEMAS).sort(),
      [...RECORD_NSIDS].sort(),
    );
    for (const nsid of RECORD_NSIDS) {
      assert.equal(RECORD_SCHEMAS[nsid].$type, nsid);
      assert.ok(isRecordNsid(nsid));
    }
    assert.ok(!isRecordNsid(NSID.groupMembership));
  });
});

describe("buildRecord", () => {
  it("adds $type and applies lexicon defaults", () => {
    const item = buildRecord(NSID.pledgeItem, {
      board: eventRef,
      title: "salad",
      capacity: 2,
      createdAt,
    });
    assert.equal(item.$type, NSID.pledgeItem);
    assert.equal(item.sortOrder, 0);
  });

  it("builds a meetup as the plan maps it", () => {
    const event = buildRecord(NSID.event, {
      name: "potluck",
      description: "bring something",
      startsAt: "2026-10-10T18:00:00.000Z",
      endsAt: "2026-10-10T20:00:00.000Z",
      mode: EVENT_MODE.inPerson,
      status: EVENT_STATUS.scheduled,
      locations: [
        {
          $type: NSID.locationAddress,
          country: "DE",
          name: "the community kitchen",
        },
      ],
      uris: [
        {
          uri: "https://www.laundryroom.social/en/meetup/1",
          name: "laundryroom",
        },
      ],
      createdAt,
    });
    assert.equal(event.$type, NSID.event);

    const rsvp = buildRecord(
      NSID.rsvp,
      { subject: eventRef, status: RSVP_STATUS.going },
      { rkey: "3m2pqkzbyhs2k" },
    );
    assert.equal(rsvp.status, RSVP_STATUS.going);
  });

  it("accepts a group profile with images and self-labels", async () => {
    const profile = buildRecord(NSID.laundryroomGroupProfile, {
      displayName: "👍🏽".repeat(64),
      avatar: await image("image/webp", 1_999_999),
      labels: { $type: SELF_LABELS_TYPE, values: [{ val: "porn" }] },
      country: "DE",
      createdAt,
    });
    assert.equal(profile.displayName, "👍🏽".repeat(64));
  });
});

describe("safeParseRecord", () => {
  it("reports a missing required field by path", () => {
    const error = failure(
      safeParseRecord(NSID.thread, {
        $type: NSID.thread,
        title: "hi",
        createdAt,
      }),
    );
    assert.deepEqual(
      error.issues.map((i) => [i.code, i.path]),
      [["required_key", "$.text"]],
    );
  });

  it("counts graphemes, not code units", () => {
    const error = failure(
      safeParseRecord(NSID.laundryroomGroupProfile, {
        $type: NSID.laundryroomGroupProfile,
        displayName: "👍🏽".repeat(65),
        createdAt,
      }),
    );
    assert.deepEqual(
      error.issues.map((i) => [i.code, i.path]),
      [["too_big", "$.displayName"]],
    );
  });

  it("enforces image types and sizes", async () => {
    for (const avatar of [
      await image("image/gif", 1000),
      await image("image/png", 2_000_001),
    ]) {
      failure(
        safeParseRecord(NSID.actorProfile, {
          $type: NSID.actorProfile,
          avatar,
          createdAt,
        }),
      );
    }
  });

  it("refuses a record of another collection", () => {
    const reply = buildRecord(NSID.reply, {
      thread: eventRef,
      text: "same here",
      createdAt,
    });
    failure(safeParseRecord(NSID.thread, reply));
  });

  it("checks strongRefs", () => {
    failure(
      safeParseRecord(NSID.pledgeFulfillment, {
        $type: NSID.pledgeFulfillment,
        item: { uri: eventRef.uri, cid: "not-a-cid" },
        quantity: 1,
        createdAt,
      }),
    );
  });

  it("checks the rkey against the lexicon's key type", () => {
    const thread = {
      $type: NSID.thread,
      title: "hi",
      text: "hello",
      createdAt,
    };
    assert.ok(
      safeParseRecord(NSID.thread, thread, { rkey: "3m2pqkzbyhs2k" }).success,
    );
    const error = failure(
      safeParseRecord(NSID.thread, thread, { rkey: "self" }),
    );
    assert.deepEqual(error.issues, [
      { code: "invalid_rkey", path: "rkey", expected: "tid" },
    ]);

    const profile = { $type: NSID.actorProfile, createdAt };
    assert.ok(
      safeParseRecord(NSID.actorProfile, profile, { rkey: "self" }).success,
    );
    failure(
      safeParseRecord(NSID.actorProfile, profile, { rkey: "3m2pqkzbyhs2k" }),
    );

    // records keyed by their event's or item's rkey: that is a tid too
    const fulfillment = {
      $type: NSID.pledgeFulfillment,
      item: eventRef,
      quantity: 1,
      createdAt,
    };
    assert.ok(
      safeParseRecord(NSID.pledgeFulfillment, fulfillment, {
        rkey: "3m2pqkzbyhs2k",
      }).success,
    );
    failure(
      safeParseRecord(NSID.pledgeFulfillment, fulfillment, { rkey: "x:y" }),
    );
    const info = { $type: NSID.eventInfo, event: eventRef, createdAt };
    failure(safeParseRecord(NSID.eventInfo, info, { rkey: "self" }));
  });

  it("leaves optional what may be unlimited or empty", () => {
    assert.ok(
      safeParseRecord(NSID.pledgeItem, {
        $type: NSID.pledgeItem,
        board: eventRef,
        title: "chairs",
        createdAt,
      }).success,
    );
    assert.ok(
      safeParseRecord(NSID.attendance, {
        $type: NSID.attendance,
        event: eventRef,
        createdAt,
      }).success,
    );
    // no event can have more places than an attendance record can list
    const info = { $type: NSID.eventInfo, event: eventRef, createdAt };
    assert.ok(
      safeParseRecord(NSID.eventInfo, { ...info, capacity: 1000 }).success,
    );
    failure(safeParseRecord(NSID.eventInfo, { ...info, capacity: 1001 }));
  });

  it("refuses a collection it has no lexicon for, without throwing", () => {
    const label = "group.opensocial.label" as typeof NSID.thread;
    const error = failure(safeParseRecord(label, {}, { rkey: "self" }));
    assert.deepEqual(error.issues, [
      { code: "unknown_collection", path: "collection" },
    ]);
  });

  it("is strict by default and lenient on request (ingest)", () => {
    const rsvp = {
      $type: NSID.rsvp,
      subject: eventRef,
      status: RSVP_STATUS.going,
    };
    const event = {
      $type: NSID.event,
      name: "x",
      createdAt: "2026-10-04T10:00:00",
    };
    failure(safeParseRecord(NSID.event, event));
    assert.ok(safeParseRecord(NSID.event, event, { strict: false }).success);
    assert.ok(safeParseRecord(NSID.rsvp, rsvp).success);
  });

  it("never puts the record's values into the error", () => {
    const secret = "secret members-only text";
    const valid = { $type: NSID.thread, title: "hi", text: "hello", createdAt };
    // validation stops at the first issue, so one bad field per case
    const cases = [
      { text: [secret] }, // invalid_type
      { subject: secret }, // invalid_format
      { createdAt: secret }, // invalid_format
      { title: secret.repeat(100) }, // too_big
      { $type: secret }, // invalid_value
    ];
    for (const bad of cases) {
      const error = failure(safeParseRecord(NSID.thread, { ...valid, ...bad }));
      assert.ok(!error.message.includes(secret), error.message);
      assert.ok(!JSON.stringify(error.issues).includes(secret));
      assert.equal(error.cause, undefined);
    }
  });
});

describe("space uris", () => {
  const reply = {
    $type: NSID.reply,
    thread: spaceThread,
    parent: {
      uri: spaceUri(`${NSID.forumSpace}/self`, groupDid, NSID.reply),
      cid,
    },
    text: "same here",
    createdAt,
  };

  it("are no at-uris to the stable @atproto/syntax", () => {
    const error = failure(safeParseRecord(NSID.reply, reply));
    assert.deepEqual(
      error.issues.map((i) => [i.code, i.path, i.expected]),
      [["invalid_format", "$.thread.uri", "at-uri"]],
    );
    failure(safeParseRecord(NSID.reply, reply, { strict: false }));
  });

  it("pass in strongRefs and at-uri fields with isSpaceUri", () => {
    const parsed = parseRecord(NSID.reply, reply, { isSpaceUri });
    assert.deepEqual(parsed, reply);
    assert.equal(reply.thread.uri, spaceThread.uri, "input unchanged");

    const thread = buildRecord(
      NSID.thread,
      {
        title: "carpool?",
        text: "who drives",
        subject: spaceEvent.uri,
        createdAt,
      },
      { isSpaceUri, rkey: "3m2pqkzbyhs2k" },
    );
    assert.equal(thread.subject, spaceEvent.uri);
    for (const [collection, fields] of [
      [NSID.rsvp, { subject: spaceEvent, status: RSVP_STATUS.going }],
      [NSID.eventInfo, { event: spaceEvent, createdAt }],
      [NSID.pledgeBoard, { event: spaceEvent, title: "food", createdAt }],
    ] as const) {
      const value = { $type: collection, ...fields };
      assert.ok(safeParseRecord(collection, value, { isSpaceUri }).success);
    }
  });

  it("still check everything else", () => {
    failure(
      safeParseRecord(
        NSID.reply,
        { ...reply, thread: { uri: spaceThread.uri, cid: "not-a-cid" } },
        { isSpaceUri },
      ),
    );
    failure(
      safeParseRecord(NSID.reply, { ...reply, text: "" }, { isSpaceUri }),
    );
    // only uris the parser accepts
    failure(
      safeParseRecord(
        NSID.reply,
        { ...reply, thread: { uri: "at://space/nope", cid } },
        { isSpaceUri },
      ),
    );
  });
});

describe("parseRecord", () => {
  it("throws a RecordValidationError", () => {
    assert.throws(
      () => parseRecord(NSID.reply, { $type: NSID.reply, text: "", createdAt }),
      RecordValidationError,
    );
  });
});

describe("ContentFields", () => {
  it("swaps strongRefs for ContentRefs, keeping optionality", () => {
    const thread: ContentRef = { kind: "row", id: "d5b0f1c4" };
    const reply: ContentFields<typeof NSID.reply> = {
      thread,
      text: "hi",
      createdAt,
    };
    type Reply = ContentFields<typeof NSID.reply>;
    const missing = { text: "hi", createdAt };
    const strong = { thread: eventRef, text: "hi", createdAt };
    // @ts-expect-error the thread is required
    const _missing: Reply = missing;
    // @ts-expect-error a strongRef is not a ContentRef
    const _strong: Reply = strong;
    assert.equal(reply.parent, undefined);
  });
});
