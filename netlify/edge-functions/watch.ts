import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/edge-functions";

const ID = /^[a-f0-9]{24}$/;

/* Serves the stored video. Range support is what makes the scrubber work:
   without it browsers can play the file but not seek within it. */
export default async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const id = new URL(request.url).pathname.split("/").filter(Boolean).pop() || "";
  if (!ID.test(id)) return new Response("Not found", { status: 404 });

  const found = await getStore("clips").getWithMetadata(`video/${id}`, {
    type: "arrayBuffer",
  });
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
