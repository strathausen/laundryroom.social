import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";

import { isAllowedImageUrl, loadGroupAvatar } from "./image";

const UPLOAD = "https://abc123.public.blob.vercel-storage.com/group/foo.png";

/** A fetch that serves `routes` (url → response factory) and records urls. */
function fakeFetch(routes: Record<string, () => Response>) {
  const urls: string[] = [];
  const fetchImpl = ((input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();
    urls.push(url);
    const route = routes[url];
    return Promise.resolve(route ? route() : new Response("", { status: 404 }));
  }) as typeof fetch;
  return { fetchImpl, urls };
}

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 40, b: 90 },
    },
  })
    .withExif({ IFD0: { Copyright: "secret gps place" } })
    .png()
    .toBuffer();
}

describe("isAllowedImageUrl", () => {
  it("allows https on our upload hosts only", () => {
    assert.ok(isAllowedImageUrl(UPLOAD));
    assert.ok(isAllowedImageUrl("https://utfs.io/f/abc"));
    for (const url of [
      "http://abc123.public.blob.vercel-storage.com/x.png",
      "https://evil.com/x.png",
      "https://public.blob.vercel-storage.com.evil.com/x.png",
      "https://abc123.public.blob.vercel-storage.com:8443/x.png",
      "https://user:pw@utfs.io/f/abc",
      "https://169.254.169.254/latest/meta-data",
      "http://localhost:5432/",
      "file:///etc/passwd",
      "not a url",
    ]) {
      assert.ok(!isAllowedImageUrl(url), url);
    }
  });
});

describe("loadGroupAvatar", () => {
  it("re-encodes an upload to a small webp without metadata", async () => {
    const source = await png(2400, 1200);
    const { fetchImpl } = fakeFetch({ [UPLOAD]: () => new Response(source) });
    const avatar = await loadGroupAvatar(
      "g1",
      UPLOAD,
      "  a red square  ",
      fetchImpl,
    );
    assert.ok(avatar);
    assert.equal(avatar.mimeType, "image/webp");
    assert.equal(avatar.alt, "a red square");
    assert.ok(avatar.bytes.length <= 2_000_000);
    const meta = await sharp(avatar.bytes).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 1000);
    assert.equal(meta.height, 500);
    assert.equal(meta.exif, undefined);
  });

  it("encodes the same image to the same bytes (so the blob is reused)", async () => {
    const source = await png(300, 300);
    const { fetchImpl } = fakeFetch({ [UPLOAD]: () => new Response(source) });
    const a = await loadGroupAvatar("g1", UPLOAD, null, fetchImpl);
    const b = await loadGroupAvatar("g1", UPLOAD, null, fetchImpl);
    assert.ok(a && b);
    assert.deepEqual(a.bytes, b.bytes);
  });

  it("gives no avatar for no image, a foreign host, a missing or broken file", async () => {
    const { fetchImpl, urls } = fakeFetch({
      [UPLOAD]: () => new Response("<html>not an image</html>"),
    });
    assert.equal(await loadGroupAvatar("g1", null, null, fetchImpl), null);
    assert.equal(
      await loadGroupAvatar("g1", "https://evil.com/x.png", null, fetchImpl),
      null,
    );
    assert.ok(!urls.includes("https://evil.com/x.png"));
    assert.equal(
      await loadGroupAvatar("g1", "https://utfs.io/f/gone", null, fetchImpl),
      null,
    );
    assert.equal(await loadGroupAvatar("g1", UPLOAD, null, fetchImpl), null);
  });

  it("keeps the current avatar while the image host has trouble", async () => {
    const { fetchImpl } = fakeFetch({
      [UPLOAD]: () => new Response("", { status: 503 }),
    });
    assert.equal(
      await loadGroupAvatar("g1", UPLOAD, null, fetchImpl),
      undefined,
    );
  });

  it("follows redirects on upload hosts only", async () => {
    const source = await png(10, 10);
    const target = "https://utfs.io/f/final";
    const { fetchImpl, urls } = fakeFetch({
      "https://utfs.io/f/start": () =>
        new Response(null, { status: 302, headers: { location: target } }),
      [target]: () => new Response(source),
      "https://utfs.io/f/away": () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/" },
        }),
    });
    assert.ok(
      await loadGroupAvatar("g1", "https://utfs.io/f/start", null, fetchImpl),
    );
    assert.equal(
      await loadGroupAvatar("g1", "https://utfs.io/f/away", null, fetchImpl),
      undefined,
    );
    assert.ok(!urls.some((url) => url.includes("169.254")));
  });
});
