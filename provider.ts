import type { SearchResponse, SearchOptions } from "./types.ts";

export type SearchProviderId = "exa" | "brave" | "parallel" | "tavily";

/**
 * Every search provider implements this contract.
 * Adding a new provider = one file that implements this interface + register().
 */
export interface SearchProvider {
	readonly id: SearchProviderId;
	readonly label: string;
	/** Whether the provider is configured (has a valid API key or MCP access). */
	isAvailable(): boolean;
	/** Run a search. Options are a subset of SearchOptions; providers that accept
	 *  extended options (e.g. includeContent) should accept SearchOptions too. */
	search(query: string, options: SearchOptions): Promise<SearchResponse>;
}

const registry = new Map<SearchProviderId, SearchProvider>();

/** The canonical fallback order used by auto mode. */
export const PROVIDER_ORDER: SearchProviderId[] = ["exa", "brave", "parallel", "tavily"];

export function register(provider: SearchProvider): void {
	registry.set(provider.id, provider);
}

export function get(id: SearchProviderId): SearchProvider | undefined {
	return registry.get(id);
}

export function list(): SearchProvider[] {
	return PROVIDER_ORDER
		.map((id) => registry.get(id))
		.filter((p): p is SearchProvider => !!p);
}

export function listAvailable(): SearchProvider[] {
	return list().filter((p) => p.isAvailable());
}
