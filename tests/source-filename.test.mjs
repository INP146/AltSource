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

test("Unicode source filenames round-trip through output and store links", async () => {
  const sourceFileName = "应用源📱.json";
  await withBuilder({ site: { baseURL: "https://example.test/apps/" }, sourceFileName }, async (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const source = JSON.parse(await fs.readFile(path.join(dir, "dist", sourceFileName), "utf8"));
    assert.deepEqual(source.apps, []);
    const metadata = JSON.parse(await fs.readFile(path.join(dir, "dist/metadata.json"), "utf8"));
    const sourceURL = `https://example.test/apps/${encodeURIComponent(sourceFileName)}`;
    assert.equal(metadata.site.sourceURL, sourceURL);
    assert.equal(decodeURIComponent(new URL(sourceURL).pathname), `/apps/${sourceFileName}`);
    const html = await fs.readFile(path.join(dir, "dist/index.html"), "utf8");
    assert.ok(html.includes(`href="${sourceURL}"`));
    for (const service of ["altstore", "sidestore"]) {
      const match = html.match(new RegExp(`href="(${service}://source\\?url=[^"]+)"`));
      assert.ok(match, `${service} source link is rendered`);
      assert.equal(new URL(match[1]).searchParams.get("url"), sourceURL);
    }
  });
});

test("store links preserve reserved filename characters through nested URL encoding", async () => {
  await withBuilder({ site: { baseURL: "https://example.test/apps/" }, sourceFileName: "my source#1%.json" }, async (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const html = await fs.readFile(path.join(dir, "dist/index.html"), "utf8");
    const sourceURL = "https://example.test/apps/my%20source%231%25.json";
    assert.ok(html.includes(`href="${sourceURL}"`));
    for (const service of ["altstore", "sidestore"]) {
      const match = html.match(new RegExp(`href="(${service}://source\\?url=[^"]+)"`));
      assert.ok(match, `${service} source link is rendered`);
      const decodedURL = new URL(match[1]).searchParams.get("url");
      assert.equal(decodedURL, sourceURL);
      assert.equal(new URL(decodedURL).hash, "");
      assert.equal(decodeURIComponent(new URL(decodedURL).pathname), "/apps/my source#1%.json");
    }
  });
});
