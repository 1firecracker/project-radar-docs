import { dirname } from "node:path";

export const GITHUB_PAGES_LAUNCH_AGENT_LABEL =
  "com.baowenzhuo.project-radar-github-pages-sync";
export const LABEL = GITHUB_PAGES_LAUNCH_AGENT_LABEL;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Render the fixed 30-minute user LaunchAgent used by GitHub Pages sync.
 * Paths are supplied by the installer and are escaped as XML text nodes.
 */
export function renderGitHubPagesLaunchAgent({
  nodePath,
  scriptPath,
  workingDirectory,
  stdoutPath,
  stderrPath,
}) {
  const path = [dirname(nodePath), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(":");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(GITHUB_PAGES_LAUNCH_AGENT_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(scriptPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(workingDirectory)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(path)}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${escapeXml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(stderrPath)}</string>
</dict>
</plist>
`;
}
