import type { ExtractedContent } from "./../extract/extract.ts";

/** A single cited search result. */
export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
}

/** Normalized response shape every search provider returns. */
export interface SearchResponse {
	answer: string;
	results: SearchResult[];
	inlineContent?: ExtractedContent[];
}

/** Options every search provider accepts. */
export interface SearchOptions {
	numResults?: number;
	recencyFilter?: "day" | "week" | "month" | "year";
	domainFilter?: string[];
	signal?: AbortSignal;
}
