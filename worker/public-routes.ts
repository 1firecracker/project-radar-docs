import { findManifestFile, validateManifest } from "../lib/content/manifest";
import { validateContentPath } from "../lib/content/paths";
import { getCurrentManifest } from "../lib/content/r2-store";
import type { SiteEnv } from "./env";

const HASH = /^[0-9a-f]{64}$/;
const HTML_CSP =
  "default-src 'self' data:; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'";

function contentHeaders(cacheControl: string): Headers {
  return new Headers({
    "cache-control": cacheControl,
    "x-content-type-options": "nosniff",
  });
}

function jsonError(error: string, status: number): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

export async function handlePublicRoute(
  request: Request,
  env: Pick<SiteEnv, "DOCS"> & Partial<Pick<SiteEnv, "ASSETS">>,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const isManifest = url.pathname === "/api/content/manifest";
  const objectMatch = url.pathname.match(
    /^\/api\/content\/objects\/([0-9a-f]{64})$/,
  );
  const isRaw = url.pathname.startsWith("/raw/");
  if (!isManifest && !objectMatch && !isRaw) return null;

  const r2Manifest = await getCurrentManifest(env.DOCS);
  let manifest = r2Manifest;
  if (!manifest && env.ASSETS) {
    const staticManifest = await env.ASSETS.fetch(
      new Request(new URL("/content/manifest.json", request.url)),
    );
    if (staticManifest.ok) {
      try {
        manifest = validateManifest(await staticManifest.json());
      } catch {
        return jsonError("Static content manifest is invalid", 503);
      }
    }
  }
  if (!manifest) return jsonError("Content has not been synchronized", 404);

  if (isManifest) {
    return Response.json(manifest, {
      headers: {
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  }

  if (objectMatch) {
    const hash = objectMatch[1];
    if (!HASH.test(hash) || !manifest.files.some((file) => file.sha256 === hash)) {
      return jsonError("Not found", 404);
    }
    if (request.headers.get("if-none-match") === `"${hash}"`) {
      return new Response(null, {
        status: 304,
        headers: { etag: `"${hash}"` },
      });
    }
    const object = r2Manifest
      ? await env.DOCS.get(`objects/${hash}`)
      : null;
    const headers = contentHeaders("public, max-age=31536000, immutable");
    headers.set("etag", `"${hash}"`);
    if (object) {
      object.writeHttpMetadata(headers);
      return new Response(request.method === "HEAD" ? null : object.body, { headers });
    }
    if (!env.ASSETS) return jsonError("Content object unavailable", 503);
    const staticObject = await env.ASSETS.fetch(
      new Request(new URL(`/content/objects/${hash}`, request.url)),
    );
    if (!staticObject.ok) return jsonError("Content object unavailable", 503);
    headers.set("content-type", staticObject.headers.get("content-type") ?? "application/octet-stream");
    return new Response(request.method === "HEAD" ? null : staticObject.body, { headers });
  }

  let path: string;
  try {
    path = validateContentPath(decodeURIComponent(url.pathname.slice("/raw/".length)));
  } catch {
    return jsonError("Invalid content path", 400);
  }
  const file = findManifestFile(manifest, path);
  if (!file) return jsonError("Not found", 404);
  const object = r2Manifest
    ? await env.DOCS.get(`objects/${file.sha256}`)
    : null;

  const headers = contentHeaders("public, max-age=5, must-revalidate");
  headers.set("content-type", file.mediaType);
  if (file.kind === "html") headers.set("content-security-policy", HTML_CSP);
  if (object) {
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  }
  if (!env.ASSETS) return jsonError("Content object unavailable", 503);
  const staticObject = await env.ASSETS.fetch(
    new Request(new URL(`/content/objects/${file.sha256}`, request.url)),
  );
  if (!staticObject.ok) return jsonError("Content object unavailable", 503);
  return new Response(request.method === "HEAD" ? null : staticObject.body, { headers });
}
