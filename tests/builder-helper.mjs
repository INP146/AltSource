import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Run the real builder in a disposable repository; never remove the user's dist.
export async function withBuilder(config, check, prepare = async () => {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "altsource-test-"));
  try {
    await fs.mkdir(path.join(dir, "scripts"));
    await fs.copyFile(path.join(root, "scripts/build-source-site.mjs"), path.join(dir, "scripts/build-source-site.mjs"));
    await fs.cp(path.join(root, "public"), path.join(dir, "public"), { recursive: true });
    await fs.writeFile(path.join(dir, "source.config.json"), JSON.stringify({ apps: [], ...config }));
    await prepare(dir);
    const env = { ...process.env };
    for (const key of ["SOURCE_CONFIG", "SITE_URL", "CF_PAGES_URL", "GITHUB_TOKEN"]) delete env[key];
    const result = spawnSync(process.execPath, ["scripts/build-source-site.mjs"], {
      cwd: dir, env, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.error, undefined);
    await check(result, dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
