import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { generateStaticSnapshot } from "../../scripts/snapshot-docs.mjs";
import { runCommand, runGitHubPagesSync, withDirectoryLock } from "../github-pages-sync.mjs";

const execFile = promisify(execFileCallback);

async function git(cwd, ...args) {
  await execFile("git", args, { cwd });
}

async function outputGit(cwd, ...args) {
  const { stdout } = await execFile("git", args, { cwd });
  return stdout.trim();
}

async function createSyncFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "radar-pages-sync-"));
  const sourceDir = join(root, "source");
  const siteDir = join(root, "site");
  const remoteDir = join(root, "remote.git");
  const outputDir = join(siteDir, "public", "content");
  const lockDir = join(siteDir, ".sync-lock");
  await mkdir(sourceDir, { recursive: true });
  await mkdir(siteDir, { recursive: true });

  await git(sourceDir, "init", "-b", "main");
  await git(sourceDir, "config", "user.email", "test@example.com");
  await git(sourceDir, "config", "user.name", "Sync Test");
  await git(sourceDir, "commit", "--allow-empty", "-m", "initial source");

  await git(siteDir, "init", "-b", "main");
  await git(siteDir, "config", "user.email", "test@example.com");
  await git(siteDir, "config", "user.name", "Sync Test");
  await writeFile(join(siteDir, "site.txt"), "keep me\n");
  await generateStaticSnapshot({ sourceDir, outputDir });
  await git(siteDir, "add", ".");
  await git(siteDir, "commit", "-m", "initial site");
  await git(root, "init", "--bare", "-b", "main", remoteDir);
  await git(siteDir, "remote", "add", "origin", remoteDir);
  await git(siteDir, "push", "-u", "origin", "main");

  const commands = [];
  const options = {
    sourceDir,
    siteDir,
    outputDir,
    lockDir,
    execute: async (command, args, commandOptions = {}) => {
      commands.push({ command, args: [...args], cwd: commandOptions.cwd });
      if (command === "npm") return { stdout: "", stderr: "", code: 0 };
      return runCommand(command, args, commandOptions);
    },
  };

  const fixture = {
    root,
    sourceDir,
    siteDir,
    outputDir,
    lockDir,
    options,
    commands,
    async writeSource(path, value) {
      await writeFile(join(sourceDir, path), value);
    },
    async siteCommitCount() {
      return Number(await outputGit(siteDir, "rev-list", "--count", "HEAD"));
    },
    async lastCommitFiles() {
      const files = await outputGit(siteDir, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD");
      return files ? files.split("\n") : [];
    },
    async commitSnapshotWithoutPush() {
      await generateStaticSnapshot({ sourceDir, outputDir });
      await git(siteDir, "add", "public/content");
      await git(siteDir, "commit", "-m", "docs: refresh Project Radar snapshot");
    },
    async commitSiteWithoutPush(path, value, message) {
      await writeFile(join(siteDir, path), value);
      await git(siteDir, "add", "--", path);
      await git(siteDir, "commit", "-m", message);
    },
  };
  t.after(() => rm(root, { recursive: true, force: true }));
  return fixture;
}

test("unchanged content does not commit or push", async (t) => {
  const fixture = await createSyncFixture(t);
  const before = await fixture.siteCommitCount();
  const result = await runGitHubPagesSync(fixture.options);
  assert.equal(result.status, "unchanged");
  assert.equal(await fixture.siteCommitCount(), before);
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"), false);
});

test("changed content verifies, commits only public/content, and pushes", async (t) => {
  const fixture = await createSyncFixture(t);
  await fixture.writeSource("README.md", "# changed\n");
  const expectedHash = createHash("sha256").update("# changed\n").digest("hex");
  const result = await runGitHubPagesSync(fixture.options);
  assert.equal(result.status, "pushed");
  assert.deepEqual(await fixture.lastCommitFiles(), [
    "public/content/manifest.json",
    `public/content/objects/${expectedHash}`,
    "public/content/raw/README.md",
  ]);
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"), true);
});

test("an already verified local commit is pushed after a previous network failure", async (t) => {
  const fixture = await createSyncFixture(t);
  await fixture.writeSource("README.md", "# changed\n");
  await fixture.commitSnapshotWithoutPush();
  const result = await runGitHubPagesSync(fixture.options);
  assert.equal(result.status, "recovered-push");
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "commit"), false);
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"), true);
});

test("source git status changes abort the site commit", async (t) => {
  const fixture = await createSyncFixture(t);
  fixture.options.generateSnapshot = async (input) => {
    const result = await generateStaticSnapshot(input);
    await fixture.writeSource("README.md", "# changed during scan\n");
    return result;
  };
  await assert.rejects(
    runGitHubPagesSync(fixture.options),
    /AgentV3 changed during synchronization/,
  );
  assert.equal(fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "commit"), false);
});

test("a held lock prevents an overlapping run", async (t) => {
  const fixture = await createSyncFixture(t);
  await mkdir(fixture.options.lockDir, { recursive: true });
  await assert.rejects(runGitHubPagesSync(fixture.options), /already running/);
});

for (const stagedPath of ["site.txt", "public/content/manifest.json"]) {
  test(`pre-existing staged ${stagedPath} is rejected without changing index or HEAD`, async (t) => {
    const fixture = await createSyncFixture(t);
    await fixture.writeSource("README.md", "# changed with pre-staged content\n");
    await writeFile(join(fixture.siteDir, stagedPath), "pre-staged edit\n");
    await git(fixture.siteDir, "add", "--", stagedPath);
    const beforeTree = await outputGit(fixture.siteDir, "write-tree");
    const beforeHead = await outputGit(fixture.siteDir, "rev-parse", "HEAD");

    await assert.rejects(
      runGitHubPagesSync(fixture.options),
      /pre-existing staged changes|staged paths/i,
    );
    assert.equal(await outputGit(fixture.siteDir, "write-tree"), beforeTree);
    assert.equal(await outputGit(fixture.siteDir, "rev-parse", "HEAD"), beforeHead);
    assert.equal(
      fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "add"),
      false,
    );
  });
}

test("recovery rejects an ahead commit with an unknown subject and does not push", async (t) => {
  const fixture = await createSyncFixture(t);
  await fixture.commitSiteWithoutPush(
    "public/content/manifest.json",
    "{\"revision\":\"tampered\"}\n",
    "chore: unrelated site change",
  );
  await assert.rejects(
    runGitHubPagesSync(fixture.options),
    /unverified|unknown|snapshot/i,
  );
  assert.equal(
    fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"),
    false,
  );
});

test("recovery rejects an ahead commit that changes paths outside public/content", async (t) => {
  const fixture = await createSyncFixture(t);
  await fixture.commitSiteWithoutPush("site.txt", "unverified edit\n", "docs: refresh Project Radar snapshot");
  await assert.rejects(
    runGitHubPagesSync(fixture.options),
    /unverified|outside public\/content|snapshot/i,
  );
  assert.equal(
    fixture.commands.some((entry) => entry.command === "git" && entry.args[0] === "push"),
    false,
  );
});

test("lock replacement is not removed by the original owner", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "radar-pages-lock-"));
  const lockDir = join(root, ".sync-lock");
  t.after(() => rm(root, { recursive: true, force: true }));

  await withDirectoryLock(lockDir, async () => {
    await writeFile(
      join(lockDir, "state.json"),
      `${JSON.stringify({ ownerToken: "replacement-owner" })}\n`,
    );
  });

  const replacementState = JSON.parse(await readFile(join(lockDir, "state.json"), "utf8"));
  assert.equal(replacementState.ownerToken, "replacement-owner");
});
