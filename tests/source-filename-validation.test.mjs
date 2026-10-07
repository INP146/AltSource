import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { withBuilder } from "./builder-helper.mjs";

for (const sourceFileName of ["", ".", "..", "nested/source.json", "/tmp/source.json", 42, false]) {
  test(`invalid source filename ${JSON.stringify(sourceFileName)} preserves existing output`, async () => {
    await withBuilder({ sourceFileName }, async (result, dir) => {
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /sourceFileName must be a non-empty file name/);
      assert.equal(await fs.readFile(path.join(dir, "dist/sentinel.txt"), "utf8"), "keep existing build");
    }, async (dir) => {
      await fs.mkdir(path.join(dir, "dist"));
      await fs.writeFile(path.join(dir, "dist/sentinel.txt"), "keep existing build");
    });
  });
}

for (const config of [{}, { sourceFileName: null }]) {
  test(`missing or null source filename uses source.json: ${JSON.stringify(config)}`, async () => {
    await withBuilder(config, async (result, dir) => {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, "dist/source.json"), "utf8")).apps, []);
    });
  });
}
