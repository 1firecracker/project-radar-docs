import { validateManifest } from "./manifest";
import type { ContentManifest } from "./types";

export function isStaticSnapshot(manifest: ContentManifest): boolean {
  return /^snapshot-[0-9a-f]{64}$/.test(manifest.revision);
}

export function contentObjectUrl(
  manifest: ContentManifest,
  sha256: string,
): string {
  const prefix = isStaticSnapshot(manifest)
    ? "/content/objects/"
    : "/api/content/objects/";
  return `${prefix}${encodeURIComponent(sha256)}`;
}

export async function loadContentManifest(
  fetchImpl: typeof fetch = fetch,
): Promise<ContentManifest> {
  const dynamicResponse = await fetchImpl("/api/content/manifest", {
    cache: "no-store",
  });
  if (dynamicResponse.ok) {
    return validateManifest(await dynamicResponse.json());
  }
  const staticResponse = await fetchImpl("/content/manifest.json", {
    cache: "no-store",
  });
  if (!staticResponse.ok) {
    throw new Error("内容尚未生成可用快照。");
  }
  return validateManifest(await staticResponse.json());
}
