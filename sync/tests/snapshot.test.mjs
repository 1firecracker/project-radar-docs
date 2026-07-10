import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateStaticSnapshot } from "../../scripts/snapshot-docs.mjs";

test("static snapshot is deterministic and changes only with source content", async () => {
  const root = await mkdtemp(join(tmpdir(), "radar-snapshot-"));
  const sourceDir = join(root, "source");
  const outputDir = join(root, "public", "content");
  await mkdir(join(sourceDir, "images"), { recursive: true });
  await writeFile(join(sourceDir, "README.md"), "# Project Radar\n");
  await writeFile(join(sourceDir, "images", "radar.png"), Buffer.from([1, 2, 3]));

  const first = await generateStaticSnapshot({
    sourceDir,
    outputDir,
    now: new Date("2026-07-10T12:00:00.000Z"),
  });
  assert.equal(first.changed, true);
  assert.equal(first.manifest.files.length, 2);
  assert.match(first.manifest.revision, /^snapshot-[0-9a-f]{64}$/);
  const object = first.manifest.files.find((file) => file.path === "README.md");
  assert.ok(object);
  assert.equal(
    await readFile(join(outputDir, "objects", object.sha256), "utf8"),
    "# Project Radar\n",
  );
  assert.equal((await stat(join(outputDir, "manifest.json"))).isFile(), true);

  const second = await generateStaticSnapshot({
    sourceDir,
    outputDir,
    now: new Date("2026-07-10T13:00:00.000Z"),
  });
  assert.equal(second.changed, false);
  assert.deepEqual(second.manifest, first.manifest);

  await writeFile(join(sourceDir, "README.md"), "# Project Radar\n\nUpdated\n");
  const third = await generateStaticSnapshot({
    sourceDir,
    outputDir,
    now: new Date("2026-07-10T13:30:00.000Z"),
  });
  assert.equal(third.changed, true);
  assert.notEqual(third.manifest.revision, first.manifest.revision);
});
