import { validateContentPath } from "./paths";
import type { ContentKind, ContentManifest, ManifestFile } from "./types";

const SHA256 = /^[0-9a-f]{64}$/;
const KINDS = new Set<ContentKind>(["markdown", "html", "asset"]);
const ROOT_ORDER = [
  "README.md",
  "产品概要.md",
  "零版产品需求.md",
  "技术设计.md",
  "实施计划.md",
  "测试与演示.md",
] as const;

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${name}`);
  }
  return value as Record<string, unknown>;
}

function validateFile(value: unknown): ManifestFile {
  const candidate = record(value, "manifest file");
  const path = validateContentPath(String(candidate.path ?? ""));
  const sha256 = candidate.sha256;
  if (typeof sha256 !== "string" || !SHA256.test(sha256)) {
    throw new Error("Invalid sha256");
  }
  const bytes = candidate.bytes;
  if (!Number.isSafeInteger(bytes) || Number(bytes) < 0) {
    throw new Error("Invalid byte count");
  }
  const mediaType = candidate.mediaType;
  if (typeof mediaType !== "string" || mediaType.length === 0) {
    throw new Error("Invalid media type");
  }
  const kind = candidate.kind;
  if (typeof kind !== "string" || !KINDS.has(kind as ContentKind)) {
    throw new Error("Invalid content kind");
  }
  return { path, sha256, bytes: Number(bytes), mediaType, kind: kind as ContentKind };
}

export function validateManifest(value: unknown): ContentManifest {
  const candidate = record(value, "manifest");
  if (candidate.schemaVersion !== 1) throw new Error("Unsupported manifest schema");
  if (typeof candidate.revision !== "string" || candidate.revision.length === 0) {
    throw new Error("Invalid manifest revision");
  }
  if (
    typeof candidate.generatedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.generatedAt))
  ) {
    throw new Error("Invalid generated timestamp");
  }
  if (!Array.isArray(candidate.files)) throw new Error("Invalid manifest files");

  const files = candidate.files.map(validateFile);
  const paths = new Set<string>();
  for (const file of files) {
    if (paths.has(file.path)) throw new Error(`Duplicate path: ${file.path}`);
    paths.add(file.path);
  }

  return {
    schemaVersion: 1,
    revision: candidate.revision,
    generatedAt: candidate.generatedAt,
    files,
  };
}

export function findManifestFile(
  manifest: ContentManifest,
  path: string,
): ManifestFile | undefined {
  const safePath = validateContentPath(path);
  return manifest.files.find((file) => file.path === safePath);
}

export function orderedDocuments(manifest: ContentManifest): ManifestFile[] {
  const order = new Map<string, number>(
    ROOT_ORDER.map((path, index) => [path, index]),
  );
  return manifest.files
    .filter((file) => file.kind === "markdown" || file.kind === "html")
    .slice()
    .sort((left, right) => {
      const leftOrder = order.get(left.path);
      const rightOrder = order.get(right.path);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? Number.MAX_SAFE_INTEGER) -
          (rightOrder ?? Number.MAX_SAFE_INTEGER);
      }
      const leftNested = left.path.includes("/") ? 1 : 0;
      const rightNested = right.path.includes("/") ? 1 : 0;
      if (leftNested !== rightNested) return leftNested - rightNested;
      return left.path.localeCompare(right.path, "zh-CN");
    });
}
