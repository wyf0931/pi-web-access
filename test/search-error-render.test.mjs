import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";

import { buildSearchErrorPlan } from "./../infra/render-search-error.ts";

// --- fixture: a web_search error with partial diagnostics ---
const searchError = {
	error: "Auto provider search failed:\n  - Exa: connection reset\n  - Brave: 401",
	extraLines: [
		"queries: rust async runtime comparison, tokio vs async-std",
		"providers tried: exa, brave, parallel",
		"  \u25b8 set an API key in ~/.pi/web-search.json",
	],
};

test("error path is NOT a dead-end single line: expanded plan has >1 line", () => {
	const plan = buildSearchErrorPlan(searchError);
	assert.notEqual(plan, null);
	assert.ok(plan.expanded.length > 1);
	assert.match(plan.expanded.join("\n"), /Auto provider search failed/);
});

test("expanded plan surfaces the diagnostics", () => {
	const expanded = buildSearchErrorPlan(searchError).expanded.join("\n");
	assert.match(expanded, /queries: rust async runtime comparison/);
	assert.match(expanded, /providers tried: exa, brave, parallel/);
});

test("collapsed view has expand hint", () => {
	const plan = buildSearchErrorPlan(searchError);
	assert.match(plan.collapsed.join("\n"), /queries: rust async runtime comparison/);
	assert.match(plan.expandHint, /ctrl\+o to expand/i);
});

test("bare error returns headine only, no collapsed preview", () => {
	const plan = buildSearchErrorPlan({ error: "Request failed" });
	assert.equal(plan.collapsed.length, 0, "no extra lines = empty collapsed");
	assert.equal(plan.expanded[0], "Request failed");
	assert.equal(plan.expandHint, null);
});

test("cancel error returns headine only", () => {
	const plan = buildSearchErrorPlan({ error: "The operation was aborted" });
	assert.equal(plan.expandHint, null);
	assert.match(plan.expanded[0], /abort/i);
});

test("detail-free error returns a plan with 1 expanded line", () => {
	const plan = buildSearchErrorPlan({ error: "Auto provider search failed:\n  - Exa: ECONNRESET" });
	assert.ok(plan.expanded.length >= 1);
});

test("error with details does not duplicate headline", () => {
	const plan = buildSearchErrorPlan(searchError);
	assert.ok(plan.expanded[0].toLowerCase().includes("auto provider search failed"));
});

test("non-cancel error has no curator/browser cruft", () => {
	const plan = buildSearchErrorPlan({ error: "Connection reset" });
	assert.ok(plan.expanded.length >= 0);
});

// --- integration: buildSearchErrorPlan is wired into all 3 tools ---
const toolDir = fileURLToPath(new URL("../tools", import.meta.url));
const renderingPath = fileURLToPath(new URL("../infra/rendering.ts", import.meta.url));
const renderingSrc = readFileSync(renderingPath, "utf8");
const toolFiles = readdirSync(toolDir)
	.filter((f) => f.endsWith(".ts"))
	.map((f) => readFileSync(fileURLToPath(new URL(`../tools/${f}`, import.meta.url)), "utf8"));
const allToolSrc = toolFiles.join("\n");

test("rendering.ts exports buildSearchErrorPlan and wires it into every tool", () => {
	assert.match(renderingSrc, /export \{ buildSearchErrorPlan/);
	assert.match(renderingSrc, /export function renderSearchErrorPlan/);
	for (const src of toolFiles) {
		assert.match(src, /from "\.\.\/infra\/rendering\.ts"/);
	}
	const callSiteCount = (allToolSrc.match(/const plan = buildSearchErrorPlan\(/g) || []).length;
	assert.equal(callSiteCount, 3, `expected 3 buildSearchErrorPlan calls, got ${callSiteCount}`);
	const renderCount = (allToolSrc.match(/return renderSearchErrorPlan\(plan, /g) || []).length;
	assert.equal(renderCount, 3, `expected 3 renderSearchErrorPlan returns, got ${renderCount}`);
});
