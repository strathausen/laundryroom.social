import { createRequire } from "node:module";
import type sharpModule from "sharp";

import type { GroupAvatar } from "@laundryroom/atproto";
import { groupAvatarAlt } from "@laundryroom/atproto";

/**
 * The group image (group.image, a url) as the avatar blob of the public
 * profile: fetched from the hosts our uploads live on, re-encoded with sharp
 * (webp, at most 1000 px, exif and gps dropped) and kept under the lexicon's
 * 2 MB. See docs/atproto-plan.md, "images".
 *
 * sharp is a native module. The web app depends on it (next's image
 * optimizer), so the docker image has it in its root node_modules, and the
 * worker bundle requires it from there at runtime (esbuild keeps it external).
 * Where it cannot be loaded, profiles are published without an avatar and
 * the image stays what it is today, a link on laundryroom.
 */

/** Where group images are uploaded to (next.config.js remotePatterns). */
const ALLOWED_HOSTS = [
  /^utfs\.io$/,
  /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/,
];
/** Uploads are capped at 5 MB (apps/nextjs/src/app/api/upload). */
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 20_000;
/** social.laundryroom.group.profile avatar maxSize */
const MAX_AVATAR_BYTES = 2_000_000;
/** sizes and qualities tried, until one fits MAX_AVATAR_BYTES */
const ENCODINGS = [
  { size: 1000, quality: 82 },
  { size: 1000, quality: 60 },
  { size: 600, quality: 60 },
] as const;

/** https on one of ALLOWED_HOSTS: nothing else is ever fetched. */
export function isAllowedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      ALLOWED_HOSTS.some((host) => host.test(url.hostname))
    );
  } catch {
    return false;
  }
}

type Sharp = typeof sharpModule;
let sharpPromise: Promise<Sharp | null> | undefined;
// require, not import(): the docker image's sharp is the copy in next's
// output file trace, which holds only sharp's CommonJS build (dist/*.cjs).
// import() resolves sharp's "import" export, dist/index.mjs, which is not there
const requireFromHere = createRequire(import.meta.url);

/** sharp, or null (once warned) where the native module cannot be loaded. */
export function loadSharp(): Promise<Sharp | null> {
  sharpPromise ??= new Promise<Sharp>((resolve) => {
    resolve(requireFromHere("sharp") as Sharp);
  }).then(
    (sharp) => sharp,
    (err: unknown) => {
      console.warn(
        "[group-accounts] sharp cannot be loaded: group profiles are published without an avatar",
        err instanceof Error ? err.message : err,
      );
      return null;
    },
  );
  return sharpPromise;
}

/**
 * The avatar for updateProfile:
 * - a GroupAvatar to publish;
 * - null when the group has no usable image (none, a host we do not fetch
 *   from, gone, not an image): the profile has no avatar;
 * - undefined when it cannot be decided now (the image host is unreachable,
 *   sharp is missing): the profile keeps the avatar it has.
 *
 * Throws nothing but `signal`'s abort reason (the job was stopped);
 * problems are logged with the group id, never the url's contents.
 */
export async function loadGroupAvatar(
  groupId: string,
  image: string | null,
  imageDescription: string | null,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GroupAvatar | null | undefined> {
  if (!image) return null;
  if (!isAllowedImageUrl(image)) {
    console.warn(
      `[group-accounts] group ${groupId}: its image is not on an upload host, no avatar`,
    );
    return null;
  }
  const sharp = await loadSharp();
  if (!sharp) return undefined;

  let bytes: Uint8Array;
  try {
    const downloaded = await download(image, fetchImpl, signal);
    if (!downloaded) {
      console.warn(
        `[group-accounts] group ${groupId}: its image is gone, no avatar`,
      );
      return null;
    }
    bytes = downloaded;
  } catch (err) {
    signal?.throwIfAborted();
    console.warn(
      `[group-accounts] group ${groupId}: fetching its image failed, keeping the current avatar`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  }

  try {
    for (const { size, quality } of ENCODINGS) {
      const out = await sharp(bytes, {
        // first frame only (gifs), and no decompression bombs
        animated: false,
        limitInputPixels: 50_000_000,
      })
        .rotate() // apply the exif orientation; the metadata itself is dropped
        .resize({
          width: size,
          height: size,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();
      if (out.length <= MAX_AVATAR_BYTES) {
        return {
          bytes: new Uint8Array(out),
          mimeType: "image/webp",
          alt: groupAvatarAlt(imageDescription),
        };
      }
    }
    console.warn(
      `[group-accounts] group ${groupId}: its image stays over 2 MB, no avatar`,
    );
    return null;
  } catch (err) {
    console.warn(
      `[group-accounts] group ${groupId}: its image does not decode, no avatar`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * The bytes at `url`, following at most MAX_REDIRECTS redirects that stay on
 * allowed hosts. null on 404/410; throws on anything that may pass.
 */
async function download(
  url: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<Uint8Array | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    const res = await fetchImpl(current, {
      redirect: "manual",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      const next = location ? new URL(location, current).toString() : null;
      if (!next || !isAllowedImageUrl(next)) {
        throw new Error(`redirected off the upload hosts (${res.status})`);
      }
      current = next;
      continue;
    }
    if (res.status === 404 || res.status === 410) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok || !res.body) {
      await res.body?.cancel();
      throw new Error(`the image host answered ${res.status}`);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    // leaving the loop early cancels the download
    for await (const chunk of res.body as ReadableStream<Uint8Array>) {
      total += chunk.length;
      if (total > MAX_DOWNLOAD_BYTES) break;
      chunks.push(chunk);
    }
    // too big to be one of our uploads: treat it as unusable
    if (total > MAX_DOWNLOAD_BYTES) return null;
    return Buffer.concat(chunks);
  }
  throw new Error("too many redirects");
}
