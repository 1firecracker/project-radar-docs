import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  try {
    const diagnostic = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
    };
    await writeFile(join(lockDir, "state.json"), `${JSON.stringify(diagnostic)}\n`);
    // Keep the seam available for callers that want to record lock ownership.
    void execute;
    return await callback();
  } finally {
    await rm(lockDir, { recursive: true, force: true });
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

async function stageGeneratedSnapshot(execute, siteDir) {
  await git(execute, siteDir, ["add", "--", "public/content"]);
  const staged = await gitOutput(execute, siteDir, ["diff", "--cached", "--name-only"]);
  const paths = staged ? staged.split("\n") : [];
  if (paths.some((path) => !path.startsWith("public/content/"))) {
    throw new Error("Refusing to commit paths outside public/content/");
  }
}

async function commitsAheadOfOriginMain(execute, siteDir) {
  const count = await gitOutput(execute, siteDir, ["rev-list", "--count", "origin/main..HEAD"]);
  return Number.parseInt(count || "0", 10);
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
    const sourceBefore = await sourceStatus(execute, sourceDir);
    const snapshot = await generateSnapshot({ sourceDir, outputDir });
    const sourceAfter = await sourceStatus(execute, sourceDir);
    if (sourceBefore !== sourceAfter) {
      throw new Error("AgentV3 changed during synchronization");
    }

    if (snapshot.changed) {
      await verifySite(execute, siteDir);
      await stageGeneratedSnapshot(execute, siteDir);
      await git(execute, siteDir, ["commit", "-m", "docs: refresh Project Radar snapshot"]);
    }

    const ahead = await commitsAheadOfOriginMain(execute, siteDir);
    if (ahead > 0) await pushOriginMain(execute, siteDir);
    return {
      status: snapshot.changed ? "pushed" : ahead > 0 ? "recovered-push" : "unchanged",
      revision: snapshot.manifest.revision,
    };
  }, { execute });
}
