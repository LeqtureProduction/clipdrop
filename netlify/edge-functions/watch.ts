import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/edge-functions";

const ID = /^[a-f0-9]{24}$/;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/* A bare, full-bleed looping player. Served when someone opens /v/<id> in a
   browser tab; the bytes themselves stay at the same URL under ?raw=1. */
function loopPage(id: string, name: string): string {
  const title = escapeHtml(name || "Clip");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<style>
  html, body { height: 100%; margin: 0; background: #05070a; }
  body { display: grid; place-items: center; }
  video { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
<video src="/v/${id}?raw=1" loop autoplay muted playsinline controls></video>
<script>
  // Autoplay is only permitted while muted. Unmute on the first real
  // interaction so a clip with a soundtrack isn't silent forever.
  var v = document.querySelector("video");
  var wake = function () {
    v.muted = false;
    window.removeEventListener("pointerdown", wake);
    window.removeEventListener("keydown", wake);
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
</script>
</body>
</html>`;
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const id = url.pathname.split("/").filter(Boolean).pop() || "";
  if (!ID.test(id)) return new Response("Not found", { status: 404 });

  const store = getStore("clips");

  /* Serve the player page anywhere a browser is rendering this URL as a page —
     a tab, an iframe, an <embed>. Sec-Fetch-Dest names the context: "document"
     for a top-level navigation, "iframe" for a framed one, "video" when a
     <video> tag is pulling the bytes. Only the last of those wants the file.
     The Accept header is the fallback for clients that send no Sec-Fetch-Dest,
     and ?raw=1 always wins, so the URL stays usable as a plain file. */
  const PAGE_DESTS = ["document", "iframe", "frame", "embed", "object"];
  const dest = request.headers.get("sec-fetch-dest") || "";
  const accept = request.headers.get("accept") || "";
  const wantsPage = dest
    ? PAGE_DESTS.includes(dest)
    : accept.includes("text/html");

  if (wantsPage && !url.searchParams.has("raw")) {
    // Metadata only — don't pull the whole video down just to render a page.
    const found = await store.getMetadata(`video/${id}`);
    if (!found) return new Response("Not found", { status: 404 });

    const meta = (found.metadata ?? {}) as Record<string, unknown>;
    const html = loopPage(id, String(meta.name ?? "Clip"));

    return new Response(request.method === "HEAD" ? null : html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  }

  const found = await store.getWithMetadata(`video/${id}`, { type: "arrayBuffer" });
  if (!found) return new Response("Not found", { status: 404 });

  const buf = found.data as ArrayBuffer;
  const meta = (found.metadata ?? {}) as Record<string, unknown>;
  const total = buf.byteLength;
  const filename = encodeURIComponent(String(meta.name ?? "clip"));

  const headers: Record<string, string> = {
    "content-type": String(meta.type ?? "video/mp4"),
    "accept-ranges": "bytes",
    // Ids are random and never reused, so the bytes can be cached hard.
    "cache-control": "public, max-age=31536000, immutable",
    "content-disposition": `inline; filename*=UTF-8''${filename}`,
  };

  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match && (match[1] || match[2])) {
      let start: number;
      let end: number;

      if (match[1]) {
        start = parseInt(match[1], 10);
        end = match[2] ? parseInt(match[2], 10) : total - 1;
      } else {
        // A suffix range ("bytes=-500") asks for the final N bytes.
        const suffix = parseInt(match[2], 10);
        start = Math.max(0, total - suffix);
        end = total - 1;
      }

      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
        return new Response(null, {
          status: 416,
          headers: { "content-range": `bytes */${total}`, "accept-ranges": "bytes" },
        });
      }

      end = Math.min(end, total - 1);
      const slice = buf.slice(start, end + 1);

      return new Response(request.method === "HEAD" ? null : slice, {
        status: 206,
        headers: {
          ...headers,
          "content-range": `bytes ${start}-${end}/${total}`,
          "content-length": String(end - start + 1),
        },
      });
    }
  }

  return new Response(request.method === "HEAD" ? null : buf, {
    status: 200,
    headers: { ...headers, "content-length": String(total) },
  });
};

export const config: Config = { path: "/v/*" };
