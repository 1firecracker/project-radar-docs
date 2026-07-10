import { watch } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.mjs";
import { syncOnce } from "./client.mjs";
import { computeRetryDelay } from "./core.mjs";

export function createWatcher(config, options = {}) {
  const debounceMs = options.debounceMs ?? 1_000;
  const retryBaseMs = options.retryBaseMs ?? 2_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const logger = options.logger ?? console;
  let closed = false;
  let dirty = true;
  let attempt = 0;
  let timer = null;
  let inFlight = null;

  const fsWatcher = watch(config.sourceDir, { recursive: true }, () => {
    dirty = true;
    schedule(debounceMs);
  });

  function schedule(delay) {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, delay);
  }

  async function run() {
    if (closed || inFlight) {
      dirty = true;
      return;
    }
    dirty = false;
    inFlight = syncOnce(config, fetchImpl);
    try {
      const result = await inFlight;
      attempt = 0;
      logger.info(
        JSON.stringify({
          event: "sync-complete",
          revision: result.manifest.revision,
          files: result.manifest.files.length,
        }),
      );
    } catch (error) {
      logger.error(
        JSON.stringify({
          event: "sync-failed",
          message: error instanceof Error ? error.message : "Unknown sync error",
        }),
      );
      if (error?.retryable !== false) {
        schedule(computeRetryDelay(attempt, retryBaseMs));
        attempt += 1;
      }
    } finally {
      inFlight = null;
      if (dirty && !timer) schedule(debounceMs);
    }
  }

  queueMicrotask(() => void run());

  return {
    syncNow() {
      dirty = true;
      schedule(0);
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      fsWatcher.close();
      try {
        await inFlight;
      } catch {
        // Failure has already been logged and close must remain idempotent.
      }
    },
  };
}

async function main() {
  const configIndex = process.argv.indexOf("--config");
  const configPath = configIndex >= 0 ? process.argv[configIndex + 1] : undefined;
  if (!configPath) throw new Error("Usage: node watcher.mjs --config /absolute/config.json");
  const watcher = createWatcher(await loadConfig(configPath));
  const stop = async () => {
    await watcher.close();
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        event: "watcher-failed",
        message: error instanceof Error ? error.message : "Unknown watcher error",
      }),
    );
    process.exit(1);
  });
}
