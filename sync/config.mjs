import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export async function loadConfig(path) {
  const absolutePath = resolve(path);
  const value = JSON.parse(await readFile(absolutePath, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid sync configuration");
  }
  if (typeof value.sourceDir !== "string" || !isAbsolute(value.sourceDir)) {
    throw new Error("Sync sourceDir must be an absolute path");
  }
  if (typeof value.token !== "string" || value.token.length < 8) {
    throw new Error("Sync token is missing");
  }
  if (typeof value.endpoint !== "string") throw new Error("Sync endpoint is missing");
  const endpoint = new URL(value.endpoint);
  const localHttp =
    endpoint.protocol === "http:" &&
    (endpoint.hostname === "127.0.0.1" || endpoint.hostname === "localhost");
  if (endpoint.protocol !== "https:" && !localHttp) {
    throw new Error("Sync endpoint must use HTTPS");
  }
  return {
    sourceDir: value.sourceDir,
    endpoint: endpoint.href.replace(/\/$/, ""),
    token: value.token,
  };
}
