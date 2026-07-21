import { existsSync, readFileSync } from "node:fs";
import { isExaAvailable, hasExaApiKey, searchWithExa } from "./exa.ts";
import { isBraveAvailable, searchWithBrave } from "./brave.ts";
import { isParallelAvailable, searchWithParallel } from "./parallel.ts";
import { isTavilyAvailable, searchWithTavily } from "./tavily.ts";
import type { SearchResult, SearchResponse, SearchOptions } from "./types.ts";
import { getWebSearchConfigPath } from "./utils.ts";

export type SearchProvider = "auto" | "exa" | "brave" | "parallel" | "tavily";
export type ResolvedSearchProvider = Exclude<SearchProvider, "auto">;

export interface AttributedSearchResponse extends SearchResponse {
	provider: ResolvedSearchProvider;
}

const CONFIG_PATH = getWebSearchConfigPath();

/**
 * Dedicated search providers only. Each requires its own API key (or Exa MCP
 * for zero-config). The fallback chain tries them in order of availability:
 *   Exa → Brave → Parallel → Tavily
 */
const PROVIDER_ORDER: ResolvedSearchProvider[] = ["exa", "brave", "parallel", "tavily"];

let cachedSearchProvider: SearchProvider | null = null;

function getConfiguredProvider(): SearchProvider {
	if (cachedSearchProvider) return cachedSearchProvider;
	if (!existsSync(CONFIG_PATH)) {
		cachedSearchProvider = "auto";
		return cachedSearchProvider;
	}
	let raw: { provider?: unknown };
	try {
		raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as { provider?: unknown };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Failed to parse ${CONFIG_PATH}: ${message}`);
	}
	cachedSearchProvider = normalizeSearchProvider(raw.provider);
	return cachedSearchProvider;
}

function normalizeSearchProvider(value: unknown): SearchProvider {
	const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
	const valid: SearchProvider[] = ["auto", "exa", "brave", "parallel", "tavily"];
	return valid.includes(normalized as SearchProvider) ? (normalized as SearchProvider) : "auto";
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

function isProviderAvailable(provider: ResolvedSearchProvider): boolean {
	switch (provider) {
		case "exa": return isExaAvailable();
		case "brave": return isBraveAvailable();
		case "parallel": return isParallelAvailable();
		case "tavily": return isTavilyAvailable();
	}
}

async function runProvider(
	provider: ResolvedSearchProvider,
	query: string,
	options: SearchOptions,
): Promise<SearchResponse> {
	switch (provider) {
		case "exa": return await searchWithExa(query, options);
		case "brave": return await searchWithBrave(query, options);
		case "parallel": return await searchWithParallel(query, options);
		case "tavily": return await searchWithTavily(query, options);
	}
}

/**
 * Run a web search. When `options.provider` is set (or configured) to a specific
 * provider, that provider is used directly. In `auto` mode, providers are tried
 * in order (Exa → Brave → Parallel → Tavily) until one succeeds.
 */
export async function search(query: string, options: FullSearchOptions = {}): Promise<AttributedSearchResponse> {
	const provider = options.provider ?? getConfiguredProvider();

	// Explicit provider: run it directly and surface failures.
	if (provider !== "auto") {
		const result = await runProvider(provider, query, options);
		return { ...result, provider };
	}

	// Auto: try each available provider in order.
	const errors: string[] = [];
	for (const candidate of PROVIDER_ORDER) {
		if (!isProviderAvailable(candidate)) continue;
		try {
			// Exa without an API key runs in MCP (zero-config) mode; if it returns
			// nothing we fall through to the next provider instead of hard-failing.
			if (candidate === "exa" && !hasExaApiKey()) {
				try {
					const result = await searchWithExa(query, options);
					if (result) return { ...result, provider: "exa" };
				} catch (err) {
					if (isAbortError(err)) throw err;
					// MCP failure is recoverable — try the next keyed provider.
				}
				continue;
			}
			const result = await runProvider(candidate, query, options);
			return { ...result, provider: candidate };
		} catch (err) {
			if (isAbortError(err)) throw err;
			errors.push(`${candidate}: ${errorMessage(err)}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Auto provider search failed:\n  - ${errors.join("\n  - ")}`);
	}

	throw new Error(
		"No search provider available. Set one of exaApiKey, braveApiKey, parallelApiKey, " +
		`or tavilyApiKey in ${CONFIG_PATH} (or the EXA_API_KEY, BRAVE_API_KEY, ` +
		"PARALLEL_API_KEY, TAVILY_API_KEY env vars). Exa also works zero-config via its MCP."
	);
}

// Re-export the shared types so existing callers can import everything from here.
export type { SearchResult, SearchResponse, SearchOptions } from "./types.ts";
