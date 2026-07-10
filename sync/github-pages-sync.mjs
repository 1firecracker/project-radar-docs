import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { generateStaticSnapshot } from "../scripts/snapshot-docs.mjs";

/** Execute a command, capturing both streams and rejecting non-zero exits. */
export function runCommand(command, args = [], { cwd } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code !== 0) {
        const error = new Error(`Command failed: ${command} ${args.join(" ")}`);
        error.code = code;
        error.signal = signal;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolvePromise({ stdout, stderr, code: 0 });
    });
  });
}

export async function withDirectoryLock(lockDir, callback, options = {}) {
  const execute = options.execute ?? runCommand;
  await mkdir(dirname(lockDir), { recursive: true });
  try {
    await mkdir(lockDir);
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("GitHub Pages synchronization already running");
    throw error;
  }
  const ownerToken = randomUUID();
  try {
    const diagnostic = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      ownerToken,
    };
    await writeFile(join(lockDir, "state.json"), `${JSON.stringify(diagnostic)}\n`);
    // Keep the seam available for callers that want to record lock ownership.
    void execute;
    return await callback();
  } finally {
    try {
      const state = JSON.parse(await readFile(join(lockDir, "state.json"), "utf8"));
      if (state.ownerToken === ownerToken) {
        await rm(lockDir, { recursive: true, force: true });
      }
    } catch (error) {
      if (error?.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    }
  }
}

async function git(execute, siteDir, args) {
  return execute("git", args, { cwd: siteDir });
}

async function gitOutput(execute, siteDir, args) {
  const result = await git(execute, siteDir, args);
  return result.stdout.trim();
}

async function sourceStatus(execute, sourceDir) {
  const result = await execute("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: sourceDir });
  return result.stdout;
}

async function verifySite(execute, siteDir) {
  await execute("npm", ["run", "test:unit"], { cwd: siteDir });
  await execute("npm", ["run", "test:sync"], { cwd: siteDir });
  await execute("npm", ["run", "test:pages"], { cwd: siteDir });
  await git(execute, siteDir, ["diff", "--check"]);
}

async function cachedPaths(execute, siteDir) {
  const staged = await gitOutput(execute, siteDir, ["diff", "--cached", "--name-only"]);
  return staged ? staged.split("\n") : [];
}

async function stageGeneratedSnapshot(execute, siteDir, cachedBeforeAdd = []) {
  if (cachedBeforeAdd.length > 0) {
    throw new Error("Refusing to run with pre-existing staged changes");
  }
  const currentCached = await cachedPaths(execute, siteDir);
  if (currentCached.length > 0) {
    throw new Error("Refusing to run with pre-existing staged changes");
  }
  await git(execute, siteDir, ["add", "--", "public/content"]);
  const paths = await cachedPaths(execute, siteDir);
  if (paths.some((path) => !path.startsWith("public/content/"))) {
    throw new Error("Refusing to commit paths outside public/content/");
  }
}

async function verifiedCommitsAheadOfOriginMain(execute, siteDir) {
  const commits = await gitOutput(execute, siteDir, ["rev-list", "--reverse", "origin/main..HEAD"]);
  const hashes = commits ? commits.split("\n") : [];
  for (const hash of hashes) {
    const subject = await gitOutput(execute, siteDir, ["show", "-s", "--format=%s", hash]);
    if (subject !== "docs: refresh Project Radar snapshot") {
      throw new Error(`Refusing to push unverified snapshot commit ${hash}`);
    }
    const paths = await gitOutput(execute, siteDir, [
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-only",
      "-r",
      "--no-renames",
      hash,
    ]);
    const changedPaths = paths ? paths.split("\n") : [];
    if (changedPaths.some((path) => !path.startsWith("public/content/"))) {
      throw new Error(`Refusing to push unverified snapshot commit ${hash}`);
    }
  }
  return hashes.length;
}

async function pushOriginMain(execute, siteDir) {
  await git(execute, siteDir, ["push", "origin", "main"]);
}

export async function runGitHubPagesSync(options = {}) {
  const sourceDir = resolve(options.sourceDir ?? "/Users/baowenzhuo/project/xhxagentv3/docs/bwz");
  const siteDir = resolve(options.siteDir ?? process.cwd());
  const outputDir = resolve(options.outputDir ?? join(siteDir, "public", "content"));
  const lockDir = resolve(options.lockDir ?? join(siteDir, ".github-pages-sync.lock"));
  const execute = options.execute ?? runCommand;
  const generateSnapshot = options.generateSnapshot ?? generateStaticSnapshot;

  return withDirectoryLock(lockDir, async () => {
    const cachedBefore = await cachedPaths(execute, siteDir);
    if (cachedBefore.length > 0) {
      throw new Error("Refusing to run with pre-existing staged changes");
    }
    await verifiedCommitsAheadOfOriginMain(execute, siteDir);
    const sourceBefore = await sourceStatus(execute, sourceDir);
    const snapshot = await generateSnapshot({ sourceDir, outputDir });
    const sourceAfter = await sourceStatus(execute, sourceDir);
    if (sourceBefore !== sourceAfter) {
      throw new Error("AgentV3 changed during synchronization");
    }

    if (snapshot.changed) {
      await verifySite(execute, siteDir);
      await stageGeneratedSnapshot(execute, siteDir, cachedBefore);
      await git(execute, siteDir, ["commit", "-m", "docs: refresh Project Radar snapshot"]);
    }

    const ahead = await verifiedCommitsAheadOfOriginMain(execute, siteDir);
    if (ahead > 0) await pushOriginMain(execute, siteDir);
    return {
      status: snapshot.changed ? "pushed" : ahead > 0 ? "recovered-push" : "unchanged",
      revision: snapshot.manifest.revision,
    };
  }, { execute });
}
