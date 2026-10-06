import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { withBuilder } from "./builder-helper.mjs";

test("source URL encodes reserved characters in the configured filename", async () => {
  await withBuilder({ site: { baseURL: "https://example.test/apps/" }, sourceFileName: "my source#1%.json" }, async (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const metadata = JSON.parse(await fs.readFile(path.join(dir, "dist/metadata.json"), "utf8"));
    assert.equal(metadata.site.sourceURL, "https://example.test/apps/my%20source%231%25.json");
    const source = JSON.parse(await fs.readFile(path.join(dir, "dist/my source#1%.json"), "utf8"));
    assert.deepEqual(source.apps, []);
  });
});
