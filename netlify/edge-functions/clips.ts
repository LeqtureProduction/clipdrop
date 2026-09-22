import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/edge-functions";

const ID = /^[a-f0-9]{24}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (request: Request): Promise<Response> => {
  const store = getStore("clips");

  if (request.method === "GET") {
    const { blobs } = await store.list({ prefix: "video/" });

    const clips = await Promise.all(
      blobs.map(async (blob) => {
        const found = await store.getMetadata(blob.key);
        const meta = (found?.metadata ?? {}) as Record<string, unknown>;
        return { id: blob.key.slice("video/".length), ...meta };
      }),
    );

    // Newest first; ISO-8601 sorts correctly as text.
    clips.sort((a, b) =>
      String(b.uploadedAt ?? "").localeCompare(String(a.uploadedAt ?? "")),
    );

    return json({ clips });
  }

  if (request.method === "DELETE") {
    const secret = Deno.env.get("UPLOAD_PASSPHRASE");
    if (secret && request.headers.get("x-upload-key") !== secret) {
      return json({ error: "That upload passphrase isn't right." }, 401);
    }

    const id = new URL(request.url).searchParams.get("id") || "";
    if (!ID.test(id)) return json({ error: "Unknown clip." }, 400);

    await store.delete(`video/${id}`);
    return json({ ok: true });
  }

  return json({ error: "Use GET or DELETE." }, 405);
};

export const config: Config = { path: "/api/clips" };
