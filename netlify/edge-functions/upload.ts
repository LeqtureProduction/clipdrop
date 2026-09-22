import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/edge-functions";

/* Netlify caps an edge function's request body at 25 MB, so that is the
   real ceiling here — not the blob store, which holds up to 5 GB. */
const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime"]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function header(request: Request, name: string): string {
  const raw = request.headers.get(name);
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function num(request: Request, name: string): number | null {
  const v = Number(request.headers.get(name) || "0");
  return Number.isFinite(v) && v > 0 ? v : null;
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  // When UPLOAD_PASSPHRASE is unset the site accepts uploads from anyone.
  const secret = Deno.env.get("UPLOAD_PASSPHRASE");
  if (secret && request.headers.get("x-upload-key") !== secret) {
    return json({ error: "That upload passphrase isn't right." }, 401);
  }

  const type = request.headers.get("x-file-type") || "";
  if (!ALLOWED.has(type)) {
    return json({ error: "Only MP4, WebM and MOV files can be uploaded." }, 415);
  }

  const declared = Number(request.headers.get("x-file-size") || "0");
  if (declared > MAX_BYTES) {
    return json({ error: "That file is over the 25 MB limit." }, 413);
  }

  let buf: ArrayBuffer;
  try {
    buf = await request.arrayBuffer();
  } catch {
    return json({ error: "The upload was cut off. Try it again." }, 400);
  }

  if (buf.byteLength === 0) return json({ error: "That file is empty." }, 400);
  if (buf.byteLength > MAX_BYTES) {
    return json({ error: "That file is over the 25 MB limit." }, 413);
  }

  const id = newId();

  // Blob metadata is capped at 2 KB, so keep the filename bounded.
  await getStore("clips").set(`video/${id}`, buf, {
    metadata: {
      name: (header(request, "x-file-name") || "clip").slice(0, 180),
      type,
      size: buf.byteLength,
      duration: num(request, "x-duration"),
      width: num(request, "x-width"),
      height: num(request, "x-height"),
      uploadedAt: new Date().toISOString(),
    },
  });

  return json({ id });
};

export const config: Config = { path: "/api/upload" };
