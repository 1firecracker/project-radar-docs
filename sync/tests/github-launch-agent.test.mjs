import assert from "node:assert/strict";
import test from "node:test";
import { renderGitHubPagesLaunchAgent } from "../github-launch-agent.mjs";

const paths = {
  nodePath: "/opt/homebrew/bin/node",
  scriptPath:
    "/Users/tester/project-radar/scripts/run-github-pages-sync.mjs",
  workingDirectory: "/Users/tester/project-radar",
  stdoutPath:
    "/Users/tester/Library/Logs/ProjectRadarGitHubPagesSync/stdout.log",
  stderrPath:
    "/Users/tester/Library/Logs/ProjectRadarGitHubPagesSync/stderr.log",
};

test("renders a fixed 10-minute GitHub Pages LaunchAgent", () => {
  const plist = renderGitHubPagesLaunchAgent(paths);

  assert.match(
    plist,
    /<key>Label<\/key>\s*<string>com\.baowenzhuo\.project-radar-github-pages-sync<\/string>/,
  );
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>600<\/integer>/);
  for (const value of Object.values(paths)) {
    assert.match(plist, new RegExp(`<string>${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}<\\/string>`));
  }
  assert.match(
    plist,
    new RegExp(
      `<key>ProgramArguments<\\/key>[\\s\\S]*<string>${paths.nodePath}<\\/string>[\\s\\S]*<string>${paths.scriptPath}<\\/string>`,
    ),
  );
  assert.match(
    plist,
    new RegExp(
      `<key>EnvironmentVariables<\\/key>[\\s\\S]*<key>PATH<\\/key>[\\s\\S]*<string>${[
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
      ]
        .map((segment) => segment.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&"))
        .join("[\\s\\S]*")}<\\/string>`,
    ),
  );
  assert.doesNotMatch(plist, /KeepAlive|DOCS_SYNC_TOKEN|GITHUB_TOKEN|Agent|Codex/i);
});

test("escapes XML values in LaunchAgent paths", () => {
  const plist = renderGitHubPagesLaunchAgent({
    ...paths,
    scriptPath: "/Users/tester/project & docs/run<sync>.mjs",
  });
  assert.match(plist, /project &amp; docs\/run&lt;sync&gt;\.mjs/);
});
