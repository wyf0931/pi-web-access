import { existsSync, readFileSync } from "node:fs";
import { listAvailable, get, list, type SearchProviderId } from "./../providers/provider.ts";

// Ensure all providers self-register at import time.
import "../providers/exa.ts";
import "../providers/brave.ts";
import "../providers/parallel.ts";
import "../providers/tavily.ts";

import type { SearchResult, SearchResponse, SearchOptions } from "./types.ts";
import { loadConfig } from "./../config.ts";

export type SearchProvider = "auto" | SearchProviderId;
export type ResolvedSearchProvider = SearchProviderId;

export interface AttributedSearchResponse extends SearchResponse {
	provider: ResolvedSearchProvider;
}

function normalizeProvider(value: unknown): SearchProvider {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	const valid = ["auto", "exa", "brave", "parallel", "tavily"];
	return valid.includes(normalized) ? (normalized as SearchProvider) : "auto";
}

export interface FullSearchOptions extends SearchOptions {
	provider?: SearchProvider;
	includeContent?: boolean;
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function isAbortError(err: unknown): boolean {
	return errorMessage(err).toLowerCase().includes("abort");
}

/**
 * Run a web search. When `options.provider` is set (or configured) to a specific
 * provider, that provider is used directly. In `auto` mode, available providers
 * are tried in PROVIDER_ORDER until one succeeds.
 */
export async function search(
	query: string,
	options: FullSearchOptions = {},
): Promise<AttributedSearchResponse> {
	const requested = options.provider ?? (loadConfig().provider ?? "auto");

	// Explicit provider — run it directly, surface failures.
	if (requested !== "auto") {
		const def = get(requested);
		if (!def) {
			throw new Error(`Unknown search provider: ${requested}. Valid: ${list().map(p => p.id).join(", ")}`);
		}
		if (!def.isAvailable()) {
			// Fall back to the next available provider in order instead of hard-failing.
			const available = listAvailable();
			if (available.length === 0) {
				throw new Error(`Provider "${def.id}" is unavailable and no fallback provider is configured.`);
			}
			const fallback = available[0];
			const result = await fallback.search(query, options);
			return { ...result, provider: fallback.id };
		}
		const result = await def.search(query, options);
		return { ...result, provider: requested };
	}

	// Auto — try each available provider in order.
	const available = listAvailable();
	if (available.length === 0) {
		throw new Error(
			"No search provider is available. Set an API key for at least one of " +
			`exaApiKey, braveApiKey, parallelApiKey, or tavilyApiKey in ~/.pi/web-search.json ` +
			"(or the EXA_API_KEY, BRAVE_API_KEY, PARALLEL_API_KEY, TAVILY_API_KEY env vars). " +
			"Exa also works zero-config via its MCP."
		);
	}

	const errors: string[] = [];
	for (const def of available) {
		try {
			const result = await def.search(query, options);
			return { ...result, provider: def.id };
		} catch (err) {
			if (isAbortError(err)) throw err;
			errors.push(`${def.id}: ${errorMessage(err)}`);
		}
	}

	throw new Error(`Auto provider search failed:\n  - ${errors.join("\n  - ")}`);
}

// Re-export shared types for convenience.
export type { SearchResult, SearchResponse, SearchOptions } from "./types.ts";
