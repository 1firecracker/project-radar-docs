import { validateManifest } from "./manifest";
import type { ContentManifest } from "./types";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;

export async function getCurrentManifest(
  bucket: R2Bucket,
): Promise<ContentManifest | null> {
  const object = await bucket.get("manifests/current.json");
  if (!object) return null;
  return validateManifest(JSON.parse(await object.text()));
}

export async function listObjectHashes(bucket: R2Bucket): Promise<string[]> {
  const hashes: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: "objects/", cursor });
    for (const object of page.objects) {
      const hash = object.key.slice("objects/".length);
      if (HASH.test(hash)) hashes.push(hash);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return hashes.sort();
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type PutObjectResult =
  | { kind: "stored" }
  | { kind: "exists" }
  | { kind: "too-large" }
  | { kind: "hash-mismatch" };

export async function putVerifiedObject(
  bucket: R2Bucket,
  expectedHash: string,
  request: Request,
): Promise<PutObjectResult> {
  if (!HASH.test(expectedHash)) return { kind: "hash-mismatch" };
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    return { kind: "too-large" };
  }
  if (await bucket.head(`objects/${expectedHash}`)) return { kind: "exists" };

  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_FILE_BYTES) return { kind: "too-large" };
  const actualHash = toHex(await crypto.subtle.digest("SHA-256", bytes));
  if (actualHash !== expectedHash) return { kind: "hash-mismatch" };

  await bucket.put(`objects/${expectedHash}`, bytes, {
    httpMetadata: {
      contentType:
        request.headers.get("content-type") ?? "application/octet-stream",
    },
  });
  return { kind: "stored" };
}

export type CommitResult =
  | { kind: "conflict"; currentRevision: string | null }
  | { kind: "missing"; sha256: string }
  | { kind: "committed"; previous: ContentManifest | null };

export async function commitManifest(
  bucket: R2Bucket,
  baseRevision: string | null,
  manifest: ContentManifest,
): Promise<CommitResult> {
  const current = await getCurrentManifest(bucket);
  const currentRevision = current?.revision ?? null;
  if (currentRevision !== baseRevision) {
    return { kind: "conflict", currentRevision };
  }
  for (const file of manifest.files) {
    if (!(await bucket.head(`objects/${file.sha256}`))) {
      return { kind: "missing", sha256: file.sha256 };
    }
  }
  await bucket.put("manifests/current.json", JSON.stringify(manifest), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return { kind: "committed", previous: current };
}

export async function garbageCollect(
  bucket: R2Bucket,
  previous: ContentManifest | null,
  current: ContentManifest,
): Promise<void> {
  const retained = new Set(current.files.map((file) => file.sha256));
  const stale = [
    ...new Set(
      (previous?.files ?? [])
        .map((file) => file.sha256)
        .filter((hash) => !retained.has(hash)),
    ),
  ];
  if (stale.length > 0) {
    await bucket.delete(stale.map((hash) => `objects/${hash}`));
  }
}
