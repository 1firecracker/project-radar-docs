import { findManifestFile } from "../lib/content/manifest";
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
  env: Pick<SiteEnv, "DOCS">,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  const isManifest = url.pathname === "/api/content/manifest";
  const objectMatch = url.pathname.match(
    /^\/api\/content\/objects\/([0-9a-f]{64})$/,
  );
  const isRaw = url.pathname.startsWith("/raw/");
  if (!isManifest && !objectMatch && !isRaw) return null;

  const manifest = await getCurrentManifest(env.DOCS);
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
    const object = await env.DOCS.get(`objects/${hash}`);
    if (!object) return jsonError("Content object unavailable", 503);
    const headers = contentHeaders("public, max-age=31536000, immutable");
    headers.set("etag", `"${hash}"`);
    object.writeHttpMetadata(headers);
    return new Response(request.method === "HEAD" ? null : object.body, { headers });
  }

  let path: string;
  try {
    path = validateContentPath(decodeURIComponent(url.pathname.slice("/raw/".length)));
  } catch {
    return jsonError("Invalid content path", 400);
  }
  const file = findManifestFile(manifest, path);
  if (!file) return jsonError("Not found", 404);
  const object = await env.DOCS.get(`objects/${file.sha256}`);
  if (!object) return jsonError("Content object unavailable", 503);

  const headers = contentHeaders("public, max-age=5, must-revalidate");
  headers.set("content-type", file.mediaType);
  if (file.kind === "html") headers.set("content-security-policy", HTML_CSP);
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
