import { withBasePath } from "./pages/routing";

export const DEFAULT_SITE_NAME = "Project Radar";

export interface SiteConfig {
  schemaVersion: 1;
  siteName: string;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid site config");
  }
  return value as Record<string, unknown>;
}

export function validateSiteConfig(value: unknown): SiteConfig {
  const candidate = record(value);
  if (candidate.schemaVersion !== 1) throw new Error("Unsupported site config schema");
  if (typeof candidate.siteName !== "string") throw new Error("Invalid site name");
  const siteName = candidate.siteName.trim();
  if (!siteName || siteName.length > 120) throw new Error("Invalid site name");
  return { schemaVersion: 1, siteName };
}

export function siteConfigUrl(basePath = ""): string {
  return withBasePath(basePath, "/content/site-config.json");
}

export function documentPageTitle(siteName: string, documentName: string): string {
  const cleanSiteName = siteName.trim() || DEFAULT_SITE_NAME;
  const cleanDocumentName = documentName.trim();
  return cleanDocumentName === "文档总览"
    ? cleanSiteName
    : `${cleanDocumentName} · ${cleanSiteName}`;
}
