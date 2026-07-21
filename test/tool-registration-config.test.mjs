import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const configSrc = readFileSync(new URL("../config.ts", import.meta.url), "utf8");
const indexSrc = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
const readmeSrc = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("web_search registration is gated by webSearch.enabled", () => {
	assert.match(configSrc, /webSearch\?: \{ enabled\?: boolean/);
	assert.match(indexSrc, /if \(initConfig\.webSearch\?\.enabled !== false\)/);
	assert.match(indexSrc, /pi\.registerTool\(createWebSearchTool/);
});

test("fetch tools remain registered outside the web_search gate", () => {
	const gateIndex = indexSrc.indexOf("if (initConfig.webSearch?.enabled !== false)");
	const fetchIndex = indexSrc.indexOf("registerTool(createFetchContentTool");
	assert.ok(gateIndex >= 0, "web_search gate not found");
	assert.ok(fetchIndex > gateIndex, "fetch_content registration should remain after web_search gate");
});

test("README documents webSearch.enabled", () => {
	assert.match(readmeSrc, /"webSearch": \{\n    "enabled": true\n  \}/);
	assert.match(readmeSrc, /webSearch\.enabled` to `false` to unregister the `web_search` tool/);
});
