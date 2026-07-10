import { validateManifest } from "./manifest";
import type { ContentManifest } from "./types";
import { withBasePath } from "../pages/routing";

export function isStaticSnapshot(manifest: ContentManifest): boolean {
  return /^snapshot-[0-9a-f]{64}$/.test(manifest.revision);
}

export function contentObjectUrl(
  manifest: ContentManifest,
  sha256: string,
  basePath = "",
): string {
  if (isStaticSnapshot(manifest)) {
    return withBasePath(
      basePath,
      `/content/objects/${encodeURIComponent(sha256)}`,
    );
  }
  return `/api/content/objects/${encodeURIComponent(sha256)}`;
}

export async function loadContentManifest(
  fetchImpl: typeof fetch = fetch,
  basePath = "",
): Promise<ContentManifest> {
  const dynamicResponse = await fetchImpl("/api/content/manifest", {
    cache: "no-store",
  });
  if (dynamicResponse.ok) {
    return validateManifest(await dynamicResponse.json());
  }
  const staticResponse = await fetchImpl(withBasePath(basePath, "/content/manifest.json"), {
    cache: "no-store",
  });
  if (!staticResponse.ok) {
    throw new Error("内容尚未生成可用快照。");
  }
  return validateManifest(await staticResponse.json());
}
