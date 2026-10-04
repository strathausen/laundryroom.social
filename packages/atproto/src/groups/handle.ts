/**
 * Handles of group accounts: `<slug>.<handle domain>`, e.g.
 * foodiespace.lndry.social. Pure rules, shared by every GroupHost. See
 * docs/atproto-plan.md, "group accounts on lndry.social" and "no new leaks".
 *
 * Handles are public on plc.directory and the relay, and the plc audit log
 * keeps every old one forever. So a group gets a readable handle (derived
 * from its name) only while it is public on the network; every other group
 * gets an opaque `g-<6 base32>` that says nothing about it.
 */

/**
 * The label rules of a service handle on the reference pds
 * (`ensureHandleServiceConstraints`): one label of 3 to 18 characters. The
 * pds additionally refuses ~1,030 reserved labels and labels its slur filter
 * matches; we do not copy those lists. Such a refusal ends the readable
 * candidates (the group gets an opaque handle, not `admin-2`), and so does
 * our own deny list below, checked before the pds is asked at all.
 */
export const GROUP_SLUG_MIN_LENGTH = 3;
export const GROUP_SLUG_MAX_LENGTH = 18;

/** `[a-z0-9-]`, no leading or trailing hyphen */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
/** `g-` and six characters of the rfc 4648 base32 alphabet, lowercase */
const OPAQUE_SLUG_PATTERN = /^g-[a-z2-7]{6}$/;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** How many random suffixes are tried after `<slug>` and `<slug>-2`. */
const RANDOM_SUFFIX_ATTEMPTS = 3;
/** Opaque candidates tried (2^30 each, so a second one is already rare). */
const OPAQUE_ATTEMPTS = 5;

/**
 * What a group's handle should look like. `readable` while the group is
 * public on the network (see publishesOnNetwork), `opaque` otherwise.
 */
export type GroupHandleIntent =
  | { kind: "readable"; name: string }
  | { kind: "opaque" };

export function isValidGroupSlug(slug: string): boolean {
  return (
    slug.length >= GROUP_SLUG_MIN_LENGTH &&
    slug.length <= GROUP_SLUG_MAX_LENGTH &&
    SLUG_PATTERN.test(slug)
  );
}

export function isOpaqueGroupSlug(slug: string): boolean {
  return OPAQUE_SLUG_PATTERN.test(slug);
}

/**
 * Names no group gets as a readable handle, compared without hyphens (so
 * `laundry-room` is `laundryroom`). Brands match anywhere in the slug,
 * because they read as "this is official" wherever they are; roles and the
 * hostnames of our own services (pds.lndry.social!) only match whole.
 */
const DENIED_BRANDS = ["laundryroom", "lndry", "bluesky", "bsky", "atproto"];
const DENIED_WORDS = new Set(
  [
    // roles and "this is us"
    "admin",
    "admins",
    "administrator",
    "administrators",
    "root",
    "superuser",
    "sysadmin",
    "sysop",
    "system",
    "owner",
    "staff",
    "team",
    "official",
    "officials",
    "support",
    "help",
    "helpdesk",
    "info",
    "contact",
    "mod",
    "mods",
    "moderator",
    "moderators",
    "moderation",
    "safety",
    "trust-and-safety",
    "security",
    "abuse",
    "report",
    "reports",
    "legal",
    "privacy",
    "terms",
    "tos",
    "impressum",
    "laundry",
    "everyone",
    "anonymous",
    "nobody",
    "null",
    "undefined",
    // mail
    "postmaster",
    "hostmaster",
    "webmaster",
    "mailer-daemon",
    "noreply",
    "no-reply",
    "mail",
    "email",
    "smtp",
    "imap",
    "pop3",
    // hostnames of our services and of the protocol
    "www",
    "web",
    "app",
    "apps",
    "api",
    "cdn",
    "static",
    "assets",
    "media",
    "dns",
    "ftp",
    "pds",
    "plc",
    "did",
    "xrpc",
    "relay",
    "bgs",
    "appview",
    "jetstream",
    "firehose",
    "labeler",
    "ozone",
    "feed",
    "feeds",
    "feedgen",
    "chat",
    "video",
    "blob",
    "blobs",
    "oauth",
    "auth",
    "login",
    "logout",
    "signin",
    "signup",
    "register",
    "account",
    "accounts",
    "settings",
    "verify",
    "invite",
    "invites",
    "status",
    "service",
    "services",
    "group",
    "groups",
    "dev",
    "test",
    "testing",
    "staging",
    "prod",
    "production",
    "localhost",
    "example",
  ].map((word) => word.replace(/-/g, "")),
);

/** Whether `slug` is on our deny list (see DENIED_BRANDS, DENIED_WORDS). */
export function isDeniedGroupSlug(slug: string): boolean {
  const bare = slug.toLowerCase().replace(/-/g, "");
  return (
    DENIED_WORDS.has(bare) ||
    DENIED_BRANDS.some((brand) => bare.includes(brand))
  );
}

/** The full handle of a slug: `foodiespace` → `foodiespace.lndry.social`. */
export function groupHandle(slug: string, domain: string): string {
  return `${slug}.${domain}`;
}

/**
 * The slug of a handle under `domain`, or null when the handle is not a
 * single label directly under it.
 */
export function slugOfHandle(handle: string, domain: string): string | null {
  const suffix = `.${domain.toLowerCase()}`;
  const lower = handle.toLowerCase();
  if (!lower.endsWith(suffix)) return null;
  const slug = lower.slice(0, -suffix.length);
  return slug.length > 0 && !slug.includes(".") ? slug : null;
}

/**
 * Whether a full handle is a readable group handle (its first label a valid
 * slug that is not opaque), whatever the domain. For showing it: an opaque
 * handle says nothing and is not worth showing.
 */
export function isReadableGroupHandle(handle: string): boolean {
  const [label = ""] = handle.toLowerCase().split(".");
  return isValidGroupSlug(label) && !isOpaqueGroupSlug(label);
}

/**
 * Whether `handle` already has the shape `intent` asks for, so it can stay.
 * A readable handle is never renamed when the group's name changes: a handle
 * is an identity other people link to, and every change is one more entry in
 * the plc log.
 */
export function handleFitsIntent(
  handle: string,
  domain: string,
  intent: GroupHandleIntent,
): boolean {
  const slug = slugOfHandle(handle, domain);
  if (slug === null || !isValidGroupSlug(slug)) return false;
  return intent.kind === "opaque"
    ? isOpaqueGroupSlug(slug)
    : !isOpaqueGroupSlug(slug);
}

/** Letters that NFKD does not decompose into ascii. */
const TRANSLITERATIONS: Record<string, string> = {
  ß: "ss",
  æ: "ae",
  œ: "oe",
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ı: "i",
};

/**
 * The longest valid-looking slug the name gives, before length rules: ascii
 * letters and digits, everything else collapsed into single hyphens, no
 * hyphen at either end. Empty when nothing usable is left (e.g. a name in a
 * non-latin script).
 */
export function slugFromName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => TRANSLITERATIONS[letter] ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Cut to `max` characters without leaving a hyphen at the end. */
function cut(slug: string, max: number): string {
  return slug.slice(0, max).replace(/-+$/, "");
}

/** `length` characters of lowercase base32 from a cryptographic source. */
export function randomBase32(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  // 32 divides 256, so masking keeps the distribution uniform
  return Array.from(bytes, (byte) => BASE32_ALPHABET[byte & 31]).join("");
}

/** A fresh opaque slug, `g-` and six random base32 characters. */
export function opaqueGroupSlug(random = randomBase32): string {
  return `g-${random(6)}`;
}

/** A readable slug: valid, not opaque-looking, not denied. */
function isUsableReadableSlug(slug: string): boolean {
  return (
    isValidGroupSlug(slug) &&
    !isOpaqueGroupSlug(slug) &&
    !isDeniedGroupSlug(slug)
  );
}

/**
 * The readable slugs to try for a group called `name`, in order: the slug of
 * the name (cut to 18), then `<slug>-2`, then three `<slug>-<4 base32>`.
 * Only the first ones are worth a try when a handle is merely taken; a
 * reserved or refused one ends the list (see the host). Nothing at all when
 * the name gives no usable slug: a non-latin name, or one on the deny list
 * (then its variants are not offered either). A slug that happens to look
 * opaque is skipped, so the two kinds can always be told apart. `random` is
 * for tests.
 */
export function* readableGroupSlugCandidates(
  name: string,
  random: (length: number) => string = randomBase32,
): Generator<string, void, undefined> {
  const base = slugFromName(name);
  const whole = cut(base, GROUP_SLUG_MAX_LENGTH);
  if (!base || isDeniedGroupSlug(base) || isDeniedGroupSlug(whole)) return;
  if (isUsableReadableSlug(whole)) yield whole;
  const second = `${cut(base, GROUP_SLUG_MAX_LENGTH - 2)}-2`;
  if (isUsableReadableSlug(second)) yield second;
  const stem = cut(base, GROUP_SLUG_MAX_LENGTH - 5);
  if (!stem) return;
  for (let i = 0; i < RANDOM_SUFFIX_ATTEMPTS; i++) {
    const suffixed = `${stem}-${random(4)}`;
    if (isUsableReadableSlug(suffixed)) yield suffixed;
  }
}

/**
 * The readable slug a group called `name` would ask for first, without any
 * randomness (the name's slug, or `<slug>-2` for a too-short one), or null.
 * What a group claims ahead of newer groups (see the credential store).
 */
export function preferredGroupSlug(name: string): string | null {
  for (const slug of readableGroupSlugCandidates(name, () => "")) {
    // the random suffix candidates are `<stem>-`, never valid: stop there
    return slug;
  }
  return null;
}

/** Five fresh opaque slugs. `random` is for tests. */
export function* opaqueGroupSlugCandidates(
  random: (length: number) => string = randomBase32,
): Generator<string, void, undefined> {
  for (let i = 0; i < OPAQUE_ATTEMPTS; i++) {
    yield opaqueGroupSlug(random);
  }
}
