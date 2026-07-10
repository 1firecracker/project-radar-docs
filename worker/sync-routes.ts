import {
  commitManifest,
  garbageCollect,
  getCurrentManifest,
  listObjectHashes,
  putVerifiedObject,
} from "../lib/content/r2-store";
import { validateManifest } from "../lib/content/manifest";
import { isAuthorized } from "../lib/sync/auth";
import type { SiteEnv, SiteExecutionContext } from "./env";

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function handleSyncRoute(
  request: Request,
  env: Pick<SiteEnv, "DOCS" | "DOCS_SYNC_TOKEN">,
  ctx: SiteExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/sync/")) return null;
  if (!isAuthorized(request.headers.get("authorization"), env.DOCS_SYNC_TOKEN)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (request.method === "GET" && url.pathname === "/api/sync/status") {
    const current = await getCurrentManifest(env.DOCS);
    return json({
      revision: current?.revision ?? null,
      hashes: await listObjectHashes(env.DOCS),
    });
  }

  const objectMatch = url.pathname.match(/^\/api\/sync\/objects\/([0-9a-f]{64})$/);
  if (request.method === "PUT" && objectMatch) {
    const result = await putVerifiedObject(env.DOCS, objectMatch[1], request);
    if (result.kind === "stored") return new Response(null, { status: 201 });
    if (result.kind === "exists") return new Response(null, { status: 204 });
    if (result.kind === "too-large") return json({ error: "Object too large" }, 413);
    return json({ error: "Object hash mismatch" }, 422);
  }

  if (request.method === "POST" && url.pathname === "/api/sync/commit") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid commit" }, 400);
    }
    const candidate = body as Record<string, unknown>;
    if (candidate.baseRevision !== null && typeof candidate.baseRevision !== "string") {
      return json({ error: "Invalid base revision" }, 400);
    }

    let manifest;
    try {
      manifest = validateManifest(candidate.manifest);
    } catch {
      return json({ error: "Invalid manifest" }, 400);
    }
    const result = await commitManifest(
      env.DOCS,
      candidate.baseRevision as string | null,
      manifest,
    );
    if (result.kind === "conflict") {
      return json({ error: "Revision conflict", revision: result.currentRevision }, 409);
    }
    if (result.kind === "missing") {
      return json({ error: "Missing object", sha256: result.sha256 }, 422);
    }
    ctx.waitUntil(garbageCollect(env.DOCS, result.previous, manifest));
    return json({ revision: manifest.revision });
  }

  return json({ error: "Not found" }, 404);
}
