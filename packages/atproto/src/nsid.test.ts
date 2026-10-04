import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isLexiconRecordKey, isNsidString } from "@atproto/lex";

import { com, community } from "./lexicons";
import {
  EVENT_MODE,
  EVENT_STATUS,
  GROUP_SPACES,
  NSID,
  OPENSOCIAL_ACTIONS,
  OPENSOCIAL_RECORD_NSIDS,
  OPENSOCIAL_REV,
  RECORD_NSIDS,
  ROLE_BINDINGS,
  RSVP_STATUS,
  SELF_LABELS_TYPE,
  SPACE_TYPES,
  XRPC,
} from "./nsid";
import { AT_URI_FIELDS } from "./validate";

const pkg = join(import.meta.dirname, "..");

/** The parts of a lexicon document these checks read. */
interface LexProperty {
  type: string;
  description?: string;
  format?: string;
  maxGraphemes?: number;
  maxLength?: number;
  accept?: string[];
  maxSize?: number;
  ref?: string;
  refs?: string[];
}
interface LexPermission {
  type: string;
  resource: string;
  collection: string[];
  spaceType?: string;
}
interface LexDef {
  type: string;
  description?: string;
  key?: string;
  name?: string;
  collections?: string[];
  properties?: Record<string, LexProperty>;
  record?: {
    type: string;
    required?: string[];
    properties: Record<string, LexProperty>;
  };
  permissions?: LexPermission[];
}
interface LexDoc {
  lexicon: number;
  id: string;
  description?: string;
  defs: Record<string, LexDef>;
}
interface LexiconFile {
  /** path relative to the package */
  file: string;
  doc: LexDoc;
  /** absent in defs-only lexicons such as com.atproto.label.defs */
  main?: LexDef;
}

function readLexicons(dir: string): LexiconFile[] {
  return readdirSync(join(pkg, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const doc = JSON.parse(readFileSync(join(pkg, dir, f), "utf8")) as LexDoc;
      return { file: join(dir, f), doc, main: doc.defs.main };
    });
}

const stable = readLexicons("lexicons");
const alpha = readLexicons("lexicons-alpha");
const all = [...stable, ...alpha];
const ours = all.filter(({ doc }) => doc.id.startsWith("social.laundryroom."));
const docById = new Map(all.map(({ doc }) => [doc.id, doc]));
const nsids: string[] = Object.values(NSID);

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

describe("nsid.ts", () => {
  it("only holds valid, distinct nsids", () => {
    for (const nsid of nsids) assert.ok(isNsidString(nsid), nsid);
    assert.equal(new Set(nsids).size, nsids.length);
    for (const method of Object.values(XRPC)) {
      assert.ok(isNsidString(method), method);
    }
  });

  it("lists the opensocial records apart from the validated ones", () => {
    for (const nsid of OPENSOCIAL_RECORD_NSIDS) {
      assert.ok(nsid.startsWith("group.opensocial."), nsid);
      assert.ok(nsids.includes(nsid), nsid);
    }
    const validated: readonly string[] = RECORD_NSIDS;
    assert.ok(!OPENSOCIAL_RECORD_NSIDS.some((n) => validated.includes(n)));
  });

  it("knows every at-uri field of every validated record", () => {
    for (const nsid of RECORD_NSIDS) {
      const props = docById.get(nsid)?.defs.main?.record?.properties ?? {};
      const expected = Object.entries(props).flatMap(([prop, schema]) => {
        if (schema.ref === NSID.strongRef) return [`${prop}.uri`];
        if (schema.format === "at-uri") return [prop];
        assert.ok(
          !(schema.refs ?? []).includes(NSID.strongRef),
          `${nsid}.${prop}: a strongRef in a union needs AT_URI_FIELDS support`,
        );
        return [];
      });
      assert.deepEqual([...AT_URI_FIELDS[nsid]].sort(), expected.sort(), nsid);
    }
  });

  it("pins the opensocial draft to a full commit hash", () => {
    assert.match(OPENSOCIAL_REV, /^[0-9a-f]{40}$/);
  });

  it("keeps the unpublished opensocial draft out of record validation", () => {
    for (const nsid of RECORD_NSIDS) {
      assert.ok(!nsid.startsWith("group.opensocial."), nsid);
    }
  });

  it("has a lexicon file for every social.laundryroom nsid, and no orphans", () => {
    const ourNsids = nsids.filter((n) => n.startsWith("social.laundryroom."));
    assert.deepEqual(ourNsids.sort(), ours.map(({ doc }) => doc.id).sort());
  });

  it("matches the generated token and $type values", () => {
    assert.equal(RSVP_STATUS.going, community.lexicon.calendar.rsvp.Going);
    assert.equal(
      RSVP_STATUS.notGoing,
      community.lexicon.calendar.rsvp.Notgoing,
    );
    assert.equal(
      RSVP_STATUS.interested,
      community.lexicon.calendar.rsvp.Interested,
    );
    const event = community.lexicon.calendar.event;
    assert.equal(EVENT_STATUS.scheduled, event.Scheduled);
    assert.equal(EVENT_STATUS.cancelled, event.Cancelled);
    assert.equal(EVENT_STATUS.postponed, event.Postponed);
    assert.equal(EVENT_STATUS.planned, event.Planned);
    assert.equal(EVENT_STATUS.rescheduled, event.Rescheduled);
    assert.equal(EVENT_MODE.inPerson, event.Inperson);
    assert.equal(EVENT_MODE.virtual, event.Virtual);
    assert.equal(EVENT_MODE.hybrid, event.Hybrid);
    assert.equal(SELF_LABELS_TYPE, com.atproto.label.defs.selfLabels.$type);
  });

  it("only creates spaces of known space types", () => {
    for (const { type } of Object.values(GROUP_SPACES)) {
      assert.ok((SPACE_TYPES as readonly string[]).includes(type), type);
    }
  });

  it("binds roles to draft actions as the plan's table says", () => {
    assert.deepEqual([...ROLE_BINDINGS.owner.actions], [...OPENSOCIAL_ACTIONS]);
    assert.deepEqual(
      [...ROLE_BINDINGS.admin.actions],
      OPENSOCIAL_ACTIONS.filter((a) => a !== "space.delete"),
    );
    assert.deepEqual(
      [...ROLE_BINDINGS.moderator.actions],
      ["mod.read", "mod.resolve", "label"],
    );
    assert.deepEqual([...ROLE_BINDINGS.member.actions], []);
  });
});

describe("lexicons/", () => {
  it("has a generated module for every stable lexicon", () => {
    // lex build fails on a lexicon it rejects; this catches one excluded
    // some other way
    for (const { doc } of stable) {
      const path = doc.id.split(".").join("/");
      assert.ok(
        existsSync(join(pkg, "src/lexicons", `${path}.defs.ts`)),
        `no generated code for ${doc.id}`,
      );
    }
  });

  it("keeps alpha-only syntax out of lexicons/", () => {
    for (const { file, doc } of stable) {
      for (const def of Object.values(doc.defs)) {
        assert.notEqual(def.type, "space", file);
      }
    }
  });

  for (const { file, doc, main = { type: "none" } } of ours) {
    describe(file, () => {
      it("is a lexicon v1 document stored under its nsid", () => {
        assert.equal(doc.lexicon, 1);
        assert.ok(isNsidString(doc.id));
        const dir = file.split("/")[0] ?? "";
        assert.equal(file, join(dir, ...doc.id.split(".")) + ".json");
        assert.equal(typeof doc.description, "string");
        assert.ok(doc.defs.main, "needs a main def");
      });

      it("describes every def and every property", () => {
        for (const [name, def] of Object.entries(doc.defs)) {
          assert.equal(
            typeof def.description,
            "string",
            `${name}: description`,
          );
          const props = def.record?.properties ?? def.properties ?? {};
          for (const [prop, schema] of Object.entries(props)) {
            const what = `${name}.${prop}: description`;
            assert.equal(typeof schema.description, "string", what);
          }
        }
      });

      const { record } = main;
      if (main.type === "record" && record) {
        it("is a well-formed record", () => {
          assert.ok(isLexiconRecordKey(main.key), `bad key ${main.key}`);
          assert.equal(record.type, "object");
          const required = record.required ?? [];
          for (const key of required) {
            assert.ok(key in record.properties, `required ${key} is undefined`);
          }
          assert.ok(required.includes("createdAt"));
          assert.equal(record.properties.createdAt?.format, "datetime");
        });

        it("bounds strings, bounds images and resolves refs", () => {
          for (const [prop, schema] of Object.entries(record.properties)) {
            if (schema.maxGraphemes !== undefined) {
              assert.ok(
                (schema.maxLength ?? 0) >= schema.maxGraphemes,
                `${prop}: maxLength`,
              );
            }
            if (schema.type === "blob") {
              assert.deepEqual(schema.accept, IMAGE_TYPES, prop);
              assert.equal(schema.maxSize, 2_000_000, prop);
            }
            const refs = schema.ref ? [schema.ref] : (schema.refs ?? []);
            for (const ref of refs) {
              const id = ref.split("#")[0] ?? "";
              assert.ok(docById.has(id), `${prop}: ${ref} is not in lexicons/`);
            }
          }
        });
      }

      const { collections } = main;
      if (main.type === "space" && collections) {
        it("is a well-formed space type (alpha syntax)", () => {
          assert.ok(isLexiconRecordKey(main.key), `bad key ${main.key}`);
          const name = main.name ?? "";
          assert.ok(name.length >= 1 && name.length <= 64, "name: 1-64");
          for (const collection of collections) {
            assert.ok(isNsidString(collection), collection);
            if (collection.startsWith("social.laundryroom.")) {
              assert.equal(
                docById.get(collection)?.defs.main?.type,
                "record",
                collection,
              );
            }
          }
        });
      }

      const { permissions } = main;
      if (main.type === "permission-set" && permissions) {
        it("only grants what an include: scope of it may carry", () => {
          for (const p of permissions) {
            assert.equal(p.type, "permission");
            if (p.resource === "repo") {
              // repo collections must sit under the set's own authority
              for (const c of p.collection) {
                assert.ok(c.startsWith("social.laundryroom."), c);
              }
              continue;
            }
            // space entries: only the space type is authority-checked
            assert.equal(p.resource, "space");
            const type = p.spaceType ?? "";
            assert.ok(type.startsWith("social.laundryroom."), type);
            const declared = docById.get(type)?.defs.main;
            assert.equal(declared?.type, "space", `${type} is not declared`);
            for (const c of p.collection) {
              assert.ok(
                declared.collections?.includes(c),
                `${c} not in ${type}`,
              );
            }
          }
        });
      }
    });
  }
});
