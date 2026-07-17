import assert from "node:assert/strict";
import test from "node:test";
import { defaultLocalConfig, validateLocalConfig } from "../../scripts/local-config.mjs";

test("local config validates the source directory and site name", () => {
  assert.deepEqual(
    validateLocalConfig(
      { sourceDir: " /tmp/project-docs ", siteName: "  Radar Hub  " },
      "/Users/tester/project/xhxagentv3/docs/bwz",
    ),
    { sourceDir: "/tmp/project-docs", siteName: "Radar Hub" },
  );
  assert.deepEqual(
    defaultLocalConfig("/Users/tester/docs"),
    { sourceDir: "/Users/tester/docs", siteName: "Project Radar" },
  );
  assert.throws(
    () => validateLocalConfig({ sourceDir: "relative", siteName: "Radar" }, "/tmp/docs"),
    /absolute source directory/i,
  );
});
