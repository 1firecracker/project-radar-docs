import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SITE_NAME,
  documentPageTitle,
  siteConfigUrl,
  validateSiteConfig,
} from "../lib/site-config";

test("site config trims and validates the shared site name", () => {
  assert.deepEqual(
    validateSiteConfig({ schemaVersion: 1, siteName: "  Radar Hub  " }),
    { schemaVersion: 1, siteName: "Radar Hub" },
  );
  assert.throws(
    () => validateSiteConfig({ schemaVersion: 1, siteName: "   " }),
    /site name/i,
  );
  assert.equal(DEFAULT_SITE_NAME, "Project Radar");
});

test("site config URLs and page titles respect the Pages base path", () => {
  assert.equal(
    siteConfigUrl("/project-radar-docs/"),
    "/project-radar-docs/content/site-config.json",
  );
  assert.equal(documentPageTitle("Radar Hub", "技术设计"), "技术设计 · Radar Hub");
  assert.equal(documentPageTitle("Radar Hub", "文档总览"), "Radar Hub");
});
