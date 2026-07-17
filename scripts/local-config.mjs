import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";

export const DEFAULT_SOURCE_DIR = "/Users/baowenzhuo/project/xhxagentv3/docs/bwz";
export const DEFAULT_SITE_NAME = "Project Radar";

export function defaultLocalConfig(sourceDir = DEFAULT_SOURCE_DIR) {
  return { sourceDir, siteName: DEFAULT_SITE_NAME };
}

export function validateLocalConfig(value, fallbackSourceDir = DEFAULT_SOURCE_DIR) {
  const candidate = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const sourceDir = typeof candidate.sourceDir === "string" && candidate.sourceDir.trim()
    ? candidate.sourceDir.trim()
    : fallbackSourceDir;
  if (!isAbsolute(sourceDir)) throw new Error("Invalid absolute source directory");
  const siteName = typeof candidate.siteName === "string"
    ? candidate.siteName.trim()
    : DEFAULT_SITE_NAME;
  if (!siteName || siteName.length > 120) throw new Error("Invalid site name");
  return { sourceDir, siteName };
}

export async function readLocalConfig(configPath, fallbackSourceDir = DEFAULT_SOURCE_DIR) {
  try {
    const raw = await readFile(configPath, "utf8");
    return validateLocalConfig(JSON.parse(raw), fallbackSourceDir);
  } catch (error) {
    if (error?.code === "ENOENT") return defaultLocalConfig(fallbackSourceDir);
    if (error instanceof SyntaxError) throw new Error("Invalid local config JSON");
    throw error;
  }
}

export async function writeLocalConfig(configPath, value, fallbackSourceDir = DEFAULT_SOURCE_DIR) {
  const config = validateLocalConfig(value, fallbackSourceDir);
  await access(config.sourceDir);
  await mkdir(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, configPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return config;
}
