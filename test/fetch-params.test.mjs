import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeFetchContentParams } from "../fetch-params.ts";

test("fetch_content params fall back to url when urls is an empty array", () => {
	const normalized = normalizeFetchContentParams({
		url: "https://example.com/docs",
		urls: [],
	});

	assert.deepEqual(normalized.urlList, ["https://example.com/docs"]);
});

test("fetch_content params keep non-empty urls precedence over url", () => {
	const normalized = normalizeFetchContentParams({
		url: "https://example.com/fallback",
		urls: ["https://example.com/primary"],
	});

	assert.deepEqual(normalized.urlList, ["https://example.com/primary"]);
});

test("fetch_content params ignore blank urls and dedupe", () => {
	const normalized = normalizeFetchContentParams({
		url: "  https://example.com/one  ",
		urls: ["", " https://example.com/two ", "https://example.com/one"],
	});

	assert.deepEqual(normalized.urlList, ["https://example.com/two", "https://example.com/one"]);
});

test("fetch_content params preserve forceClone only for boolean values", () => {
	assert.equal(normalizeFetchContentParams({ forceClone: true }).options.forceClone, true);
	assert.equal(normalizeFetchContentParams({ forceClone: false }).options.forceClone, false);
	assert.equal(normalizeFetchContentParams({ forceClone: "true" }).options.forceClone, undefined);
});
