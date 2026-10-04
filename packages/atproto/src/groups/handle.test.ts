import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupHandle,
  handleFitsIntent,
  isDeniedGroupSlug,
  isOpaqueGroupSlug,
  isReadableGroupHandle,
  isValidGroupSlug,
  opaqueGroupSlug,
  opaqueGroupSlugCandidates,
  preferredGroupSlug,
  randomBase32,
  readableGroupSlugCandidates,
  slugFromName,
  slugOfHandle,
} from "./handle";

const DOMAIN = "lndry.social";
/** deterministic "random" characters, so the candidates can be compared */
const fixed = (length: number) => "x".repeat(length);

describe("isValidGroupSlug", () => {
  it("takes [a-z0-9-], 3 to 18 characters, no hyphen at either end", () => {
    for (const slug of [
      "foo",
      "foodiespace",
      "a-b",
      "abcdefghijklmnopqr",
      "g-abcdef",
      "123",
    ]) {
      assert.ok(isValidGroupSlug(slug), slug);
    }
    for (const slug of [
      "",
      "ab",
      "abcdefghijklmnopqrs",
      "-foo",
      "foo-",
      "Foo",
      "foo.bar",
      "foo_bar",
      "fööd",
    ]) {
      assert.ok(!isValidGroupSlug(slug), slug);
    }
  });
});

describe("opaque slugs", () => {
  it("are g- and six base32 characters", () => {
    for (let i = 0; i < 50; i++) {
      const slug = opaqueGroupSlug();
      assert.match(slug, /^g-[a-z2-7]{6}$/);
      assert.ok(isValidGroupSlug(slug));
      assert.ok(isOpaqueGroupSlug(slug));
    }
    assert.ok(!isOpaqueGroupSlug("g-abc"));
    assert.ok(!isOpaqueGroupSlug("g-abcde1")); // 1 is not base32
    assert.ok(!isOpaqueGroupSlug("foodiespace"));
  });

  it("draws every base32 character", () => {
    const seen = new Set(randomBase32(4000));
    assert.equal(seen.size, 32);
  });
});

describe("slugFromName", () => {
  it("keeps ascii letters and digits and collapses the rest into hyphens", () => {
    assert.equal(slugFromName("Foodie Space"), "foodie-space");
    assert.equal(
      slugFromName("  --Berlin  Board Games!!  "),
      "berlin-board-games",
    );
    assert.equal(slugFromName("Café Crème Brûlée"), "cafe-creme-brulee");
    assert.equal(slugFromName("Straße & Øl"), "strasse-ol");
    assert.equal(slugFromName("Ştiinţă în Bucureşti"), "stiinta-in-bucuresti");
    assert.equal(slugFromName("東京の会"), "");
  });
});

describe("handles", () => {
  it("are one label under the domain", () => {
    assert.equal(
      groupHandle("foodiespace", DOMAIN),
      "foodiespace.lndry.social",
    );
    assert.equal(
      slugOfHandle("foodiespace.lndry.social", DOMAIN),
      "foodiespace",
    );
    assert.equal(
      slugOfHandle("FoodieSpace.lndry.social", DOMAIN),
      "foodiespace",
    );
    assert.equal(slugOfHandle("a.b.lndry.social", DOMAIN), null);
    assert.equal(slugOfHandle("foodiespace.bsky.social", DOMAIN), null);
    assert.equal(slugOfHandle("lndry.social", DOMAIN), null);
  });

  it("fit a readable or opaque intent by their shape only", () => {
    const readable = { kind: "readable", name: "a new name" } as const;
    const opaque = { kind: "opaque" } as const;
    assert.ok(handleFitsIntent("foodiespace.lndry.social", DOMAIN, readable));
    assert.ok(!handleFitsIntent("foodiespace.lndry.social", DOMAIN, opaque));
    assert.ok(handleFitsIntent("g-7f3kq2.lndry.social", DOMAIN, opaque));
    assert.ok(!handleFitsIntent("g-7f3kq2.lndry.social", DOMAIN, readable));
    // somewhere else (or broken) never fits, so it gets replaced
    assert.ok(!handleFitsIntent("g-7f3kq2.lndry.me", DOMAIN, opaque));
    assert.ok(!handleFitsIntent("handle.invalid", DOMAIN, readable));
  });
});

describe("isReadableGroupHandle", () => {
  it("is true for a readable first label only, whatever the domain", () => {
    assert.ok(isReadableGroupHandle("foodiespace.lndry.social"));
    assert.ok(isReadableGroupHandle("Foodie-Space.lndry.test"));
    assert.ok(!isReadableGroupHandle("g-7f3kq2.lndry.social"));
    assert.ok(!isReadableGroupHandle(".lndry.social"));
    assert.ok(!isReadableGroupHandle(""));
  });
});

describe("isDeniedGroupSlug", () => {
  it("denies brands anywhere and roles and our hostnames whole, ignoring hyphens", () => {
    for (const slug of [
      "laundryroom",
      "laundry-room",
      "laundryroom-fans",
      "the-lndry-club",
      "bluesky",
      "bsky-team",
      "atproto-devs",
      "admin",
      "ad-min",
      "support",
      "official",
      "pds",
      "p-d-s",
      "relay",
      "mailer-daemon",
      "trustandsafety",
    ]) {
      assert.ok(isDeniedGroupSlug(slug), slug);
    }
    for (const slug of [
      "foodiespace",
      "admin-club-berlin",
      "official-cheese",
      "pds-and-friends",
      "laundry-lovers",
    ]) {
      assert.ok(!isDeniedGroupSlug(slug), slug);
    }
  });
});

describe("readableGroupSlugCandidates", () => {
  const all = (...args: Parameters<typeof readableGroupSlugCandidates>) => [
    ...readableGroupSlugCandidates(...args),
  ];

  it("tries the name, -2, then random suffixes", () => {
    assert.deepEqual(all("Foodie Space", fixed), [
      "foodie-space",
      "foodie-space-2",
      "foodie-space-xxxx",
      "foodie-space-xxxx",
      "foodie-space-xxxx",
    ]);
  });

  it("cuts long names to 18 characters without a trailing hyphen", () => {
    const [whole, second, suffixed] = all(
      "The Berlin Board Game Collective",
      fixed,
    );
    assert.equal(whole, "the-berlin-board-g");
    assert.equal(second, "the-berlin-board-2");
    assert.equal(suffixed, "the-berlin-bo-xxxx");
  });

  it("only yields valid slugs, also for short or unusable names", () => {
    const names = [
      "ab",
      "a",
      "東京の会",
      "G Abcdef",
      "--",
      "x".repeat(300),
      "Ünïcødé ☕ club",
    ];
    for (const name of names) {
      for (const slug of all(name))
        assert.ok(isValidGroupSlug(slug), `${name}: ${slug}`);
    }
    assert.deepEqual(all("ab", fixed).slice(0, 2), ["ab-2", "ab-xxxx"]);
  });

  it("yields nothing for a name without a usable slug", () => {
    // a non-latin name: the group keeps an opaque handle, also while active
    assert.deepEqual(all("東京ミートアップ"), []);
    assert.deepEqual(all("--"), []);
  });

  it("yields nothing for a name on the deny list, not even with a suffix", () => {
    for (const name of [
      "Admin",
      "Support",
      "Laundryroom Fans",
      "Laundry Room",
      "Bluesky Berlin",
      "PDS",
      // nfkd folds stylized letters into the same slugs
      "ＡＤＭＩＮ",
      "𝐬𝐮𝐩𝐩𝐨𝐫𝐭",
      // a brand past the 18 characters is still a brand
      "The Very Official Laundryroom Club",
    ]) {
      assert.deepEqual(all(name), [], name);
    }
  });

  it("never yields a readable slug that looks opaque", () => {
    const [first] = all("G Abcdef", fixed);
    assert.equal(first, "g-abcdef-2");
  });
});

describe("preferredGroupSlug", () => {
  it("is the first candidate without randomness, or null", () => {
    assert.equal(preferredGroupSlug("Foodie Space"), "foodie-space");
    assert.equal(preferredGroupSlug("ab"), "ab-2");
    assert.equal(preferredGroupSlug("東京の会"), null);
    assert.equal(preferredGroupSlug("Admin"), null);
  });
});

describe("opaqueGroupSlugCandidates", () => {
  it("gives five opaque slugs", () => {
    const candidates = [...opaqueGroupSlugCandidates()];
    assert.equal(candidates.length, 5);
    assert.ok(candidates.every(isOpaqueGroupSlug));
  });
});
