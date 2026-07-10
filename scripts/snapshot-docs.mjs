import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { scanSource } from "../sync/core.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readExistingManifest(outputDir) {
  try {
    return JSON.parse(await readFile(join(outputDir, "manifest.json"), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function snapshotRevision(files) {
  const identity = files.map(({ path, sha256, content, mediaType, kind }) => ({
    path,
    sha256,
    bytes: content.byteLength,
    mediaType,
    kind,
  }));
  const digest = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return { identity, revision: `snapshot-${digest}` };
}

export async function generateStaticSnapshot({ sourceDir, outputDir, now = new Date() }) {
  const files = await scanSource(sourceDir);
  const { identity, revision } = snapshotRevision(files);
  const existing = await readExistingManifest(outputDir);
  const objectsDir = join(outputDir, "objects");
  const expectedHashes = new Set(identity.map((file) => file.sha256));
  let objectsComplete = true;
  for (const hash of expectedHashes) {
    try {
      await access(join(objectsDir, hash));
    } catch {
      objectsComplete = false;
      break;
    }
  }
  if (existing?.revision === revision && objectsComplete) {
    return { changed: false, manifest: existing };
  }

  const manifest = {
    schemaVersion: 1,
    revision,
    generatedAt: now.toISOString(),
    files: identity,
  };
  await mkdir(objectsDir, { recursive: true });
  for (const file of files) {
    await writeFile(join(objectsDir, file.sha256), file.content);
  }
  for (const filename of await readdir(objectsDir)) {
    if (!expectedHashes.has(filename)) {
      await rm(join(objectsDir, filename), { force: true });
    }
  }
  const manifestPath = join(outputDir, "manifest.json");
  const temporaryPath = `${manifestPath}.tmp`;
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporaryPath, manifestPath);
  return { changed: true, manifest };
}

async function main() {
  const sourceDir = resolve(
    argument("--source") ?? "/Users/baowenzhuo/project/xhxagentv3/docs/bwz",
  );
  const outputDir = resolve(argument("--output") ?? "public/content");
  const result = await generateStaticSnapshot({ sourceDir, outputDir });
  process.stdout.write(
    `${JSON.stringify({ changed: result.changed, revision: result.manifest.revision, files: result.manifest.files.length })}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({ status: "failed", message: error instanceof Error ? error.message : "Unknown snapshot error" })}\n`,
    );
    process.exit(1);
  });
}
