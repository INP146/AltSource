import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { withBuilder } from "./builder-helper.mjs";

test("landing page escapes configured text rather than injecting markup", async () => {
  const unsafe = `<script>alert("x")</script> & 'name'`;
  const escaped = "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;name&#39;";
  await withBuilder({ site: { name: unsafe, description: unsafe, baseURL: "https://example.test" } }, async (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const html = await fs.readFile(path.join(dir, "dist/index.html"), "utf8");
    assert.ok(html.includes(escaped));
    assert.ok(!html.includes(unsafe));
    assert.ok(!html.includes("%%SOURCE_NAME%%"));
    assert.ok(!html.includes("%%SOURCE_DESCRIPTION%%"));
  });
});

test("landing page preserves dollar replacement tokens in configured text", async () => {
  const text = "Price $$5; literal $&; prefix $`";
  const escaped = "Price $$5; literal $&amp;; prefix $`";
  await withBuilder({ site: { name: text, description: text } }, async (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    const html = await fs.readFile(path.join(dir, "dist/index.html"), "utf8");
    assert.ok(html.includes(`<title>${escaped}</title>`));
    assert.ok(html.includes(`<h1>${escaped}</h1>`));
    assert.ok(html.includes(`<meta name="description" content="${escaped}">`));
    assert.ok(html.includes(`<p class="lede">${escaped}</p>`));
    assert.ok(!html.includes("%%SOURCE_NAME%%"));
    assert.ok(!html.includes("%%SOURCE_DESCRIPTION%%"));
  });
});
