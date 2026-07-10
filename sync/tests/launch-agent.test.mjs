import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  buildLaunchAgentPlist,
  launchAgentPaths,
} from "../install-launch-agent.mjs";

test("launch agent starts the watcher without embedding its secret", () => {
  const home = "/Users/tester";
  const paths = launchAgentPaths(home);
  assert.deepEqual(paths, {
    supportDir: join(home, "Library/Application Support/ProjectRadarDocsSync"),
    runtimeDir: join(home, "Library/Application Support/ProjectRadarDocsSync/runtime"),
    configPath: join(home, "Library/Application Support/ProjectRadarDocsSync/config.json"),
    logsDir: join(home, "Library/Logs/ProjectRadarDocsSync"),
    stdoutPath: join(home, "Library/Logs/ProjectRadarDocsSync/stdout.log"),
    stderrPath: join(home, "Library/Logs/ProjectRadarDocsSync/stderr.log"),
    plistPath: join(
      home,
      "Library/LaunchAgents/com.baowenzhuo.project-radar-docs-sync.plist",
    ),
  });

  const plist = buildLaunchAgentPlist({
    nodeDir: "/opt/homebrew/bin",
    ...paths,
  });
  assert.match(plist, /<key>Label<\/key>\s*<string>com\.baowenzhuo\.project-radar-docs-sync<\/string>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
  assert.match(plist, /<key>ThrottleInterval<\/key>\s*<integer>10<\/integer>/);
  assert.match(plist, /<string>\/usr\/bin\/env<\/string>\s*<string>node<\/string>/);
  assert.match(plist, /watcher\.mjs/);
  assert.doesNotMatch(plist, /DOCS_SYNC_TOKEN|integration-secret|test-secret/);
  assert.doesNotMatch(plist, /xhxagentv3\/\.git/);
});
