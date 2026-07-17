import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createAdminServer,
  parseAdminConfigPayload,
} from "../../scripts/local-admin.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  return address.port;
}

test("admin config payload trims values and rejects unsafe input", () => {
  assert.deepEqual(
    parseAdminConfigPayload(
      { sourceDir: " /tmp/docs ", siteName: " Radar Hub " },
      "/tmp/default-docs",
    ),
    { sourceDir: "/tmp/docs", siteName: "Radar Hub" },
  );
  assert.throws(
    () => parseAdminConfigPayload({ sourceDir: "relative", siteName: "Radar" }, "/tmp/docs"),
    /absolute source directory/i,
  );
  assert.throws(
    () => parseAdminConfigPayload({ sourceDir: "/tmp/docs", siteName: "" }, "/tmp/docs"),
    /site name/i,
  );
});

test("local admin serves a loopback-only settings API", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "radar-local-admin-"));
  const sourceDir = join(root, "docs");
  const selectedDir = join(root, "selected");
  const configPath = join(root, ".local-admin", "config.json");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(selectedDir, { recursive: true });

  const { server, token } = createAdminServer({
    configPath,
    fallbackSourceDir: sourceDir,
    chooseFolder: async () => selectedDir,
  });
  const port = await listen(server);
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const unauthorized = await fetch(`${baseUrl}/api/config`);
  assert.equal(unauthorized.status, 401);

  const page = await fetch(`${baseUrl}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /选择文件夹/);

  const initial = await fetch(`${baseUrl}/api/config`, {
    headers: { "x-admin-token": token },
  });
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), {
    sourceDir,
    siteName: "Project Radar",
  });

  const selected = await fetch(`${baseUrl}/api/select-folder`, {
    method: "POST",
    headers: { "x-admin-token": token },
  });
  assert.equal(selected.status, 200);
  assert.deepEqual(await selected.json(), { sourceDir: selectedDir });

  const saved = await fetch(`${baseUrl}/api/config`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-token": token,
    },
    body: JSON.stringify({ sourceDir: selectedDir, siteName: " Radar Hub " }),
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(await saved.json(), {
    sourceDir: selectedDir,
    siteName: "Radar Hub",
  });
  assert.deepEqual(
    JSON.parse(await readFile(configPath, "utf8")),
    { sourceDir: selectedDir, siteName: "Radar Hub" },
  );
});
