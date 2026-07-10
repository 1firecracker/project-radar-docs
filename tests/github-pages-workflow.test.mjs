import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowPath = new URL("../.github/workflows/pages.yml", import.meta.url);

test("GitHub Pages workflow deploys the pages artifact from main", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path:\s*\.\/dist-pages/);
  assert.match(workflow, /environment:\s*\n\s*name:\s*github-pages/);

  assert.match(workflow, /deploy:\s*\n\s*needs:\s*build/);
  assert.match(workflow, /steps\.deployment\.outputs\.page_url/);
});
