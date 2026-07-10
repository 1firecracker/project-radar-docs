import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const MEDIA_TYPES = new Map([
  ["md", "text/markdown; charset=utf-8"],
  ["markdown", "text/markdown; charset=utf-8"],
  ["html", "text/html; charset=utf-8"],
  ["htm", "text/html; charset=utf-8"],
  ["txt", "text/plain; charset=utf-8"],
  ["css", "text/css; charset=utf-8"],
  ["js", "text/javascript; charset=utf-8"],
  ["json", "application/json; charset=utf-8"],
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["svg", "image/svg+xml"],
  ["pdf", "application/pdf"],
  ["csv", "text/csv; charset=utf-8"],
  ["zip", "application/zip"],
]);

function safeRelativePath(root, absolutePath) {
  const value = relative(root, absolutePath).split(sep).join("/").normalize("NFC");
  const segments = value.split("/");
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid content path: ${value}`);
  }
  if (segments.some((segment) => segment.startsWith("."))) {
    throw new Error(`Hidden path is not allowed: ${value}`);
  }
  return value;
}

function classify(path) {
  const extension = path.includes(".") ? path.split(".").at(-1).toLowerCase() : "";
  const kind = ["md", "markdown"].includes(extension)
    ? "markdown"
    : ["html", "htm"].includes(extension)
      ? "html"
      : "asset";
  return {
    kind,
    mediaType: MEDIA_TYPES.get(extension) ?? "application/octet-stream",
  };
}

export async function scanSource(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symbolic link is not allowed: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await lstat(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symbolic link is not allowed: ${absolutePath}`);
      }
      if (stat.size > MAX_FILE_BYTES) {
        throw new Error(`File exceeds 20 MiB: ${absolutePath}`);
      }
      const content = await readFile(absolutePath);
      if (content.byteLength > MAX_FILE_BYTES) {
        throw new Error(`File exceeds 20 MiB: ${absolutePath}`);
      }
      const path = safeRelativePath(root, absolutePath);
      const { kind, mediaType } = classify(path);
      files.push({
        path,
        absolutePath,
        sha256: createHash("sha256").update(content).digest("hex"),
        content,
        kind,
        mediaType,
      });
    }
  }
  await visit(root);
  return files.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  );
}

export function buildManifest(files, options = {}) {
  const now = options.now ?? new Date();
  const nonce = options.nonce ?? randomBytes(4).toString("hex");
  const generatedAt = now.toISOString();
  return {
    schemaVersion: 1,
    revision: `${generatedAt}-${nonce}`,
    generatedAt,
    files: files.map(({ path, sha256, content, mediaType, kind }) => ({
      path,
      sha256,
      bytes: content.byteLength,
      mediaType,
      kind,
    })),
  };
}

export function scanSignature(files) {
  return files.map((file) => `${file.path}:${file.sha256}`).join("\n");
}

export function computeRetryDelay(attempt, baseMs = 2_000) {
  return Math.min(baseMs * 2 ** Math.max(0, attempt), 300_000);
}
