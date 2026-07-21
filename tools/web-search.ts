import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai/compat";
import { fetchAllContent, type ExtractedContent } from "../extract/extract.ts";
import { search, type SearchProvider } from "../infra/search.ts";
import type { SearchResult } from "../infra/types.ts";
import { loadConfig } from "../config.ts";
import { generateId, storeResult, type QueryResultData, type StoredSearchData } from "../infra/storage.ts";
import { buildSearchErrorPlan, type SearchErrorPlan, renderSearchErrorPlan, type ToolTheme, formatSearchSummary, formatQueryHeader, formatFullResults, hasFullInlineCoverage } from "../infra/rendering.ts";
import { pendingFetches, sessionActive } from "../session.ts";

function normalizeProviderInput(value: unknown): SearchProvider | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") return "auto";
	const normalized = value.trim().toLowerCase();
	const valid: SearchProvider[] = ["auto", "exa", "brave", "parallel", "tavily"];
	return valid.includes(normalized as SearchProvider) ? normalized as SearchProvider : "auto";
}

function normalizeQueryList(queryList: unknown[]): string[] {
	const normalized: string[] = [];
	for (const query of queryList) { if (typeof query !== "string") continue; const t = query.trim(); if (t.length > 0) normalized.push(t); }
	return normalized;
}

export interface WebSearchToolDeps { pi: ExtensionAPI; }

export function createWebSearchTool({ pi }: WebSearchToolDeps) {
	function startBackgroundFetch(urls: string[]): string | null {
		if (urls.length === 0) return null;
		const fetchId = generateId();
		const controller = new AbortController();
		pendingFetches.set(fetchId, controller);
		fetchAllContent(urls, controller.signal)
			.then((fetched) => {
				if (!sessionActive || !pendingFetches.has(fetchId)) return;
				const data: StoredSearchData = { id: fetchId, type: "fetch", timestamp: Date.now(), urls: fetched };
				storeResult(fetchId, data);
				pi.appendEntry("web-search-results", data);
				const ok = fetched.filter(f => !f.error).length;
				pi.sendMessage({ customType: "web-search-content-ready", content: `Content fetched for ${ok}/${fetched.length} URLs [${fetchId}]. Full page content now available.`, display: true }, { triggerTurn: true });
			})
			.catch((err) => {
				if (!sessionActive || !pendingFetches.has(fetchId)) return;
				const message = err instanceof Error ? err.message : String(err);
				const isAbort = (err instanceof Error && err.name === "AbortError") || message.toLowerCase().includes("abort");
				if (!isAbort) pi.sendMessage({ customType: "web-search-error", content: `Content fetch failed [${fetchId}]: ${message}`, display: true }, { triggerTurn: false });
			})
			.finally(() => { pendingFetches.delete(fetchId); });
		return fetchId;
	}

	function storeAndPublishSearch(results: QueryResultData[]): string {
		const id = generateId();
		storeResult(id, { id, type: "search", timestamp: Date.now(), queries: results });
		pi.appendEntry("web-search-results", { id, type: "search", timestamp: Date.now(), queries: results });
		return id;
	}

	interface SRO { queryList: string[]; results: QueryResultData[]; urls: string[]; includeContent: boolean; inlineContent?: ExtractedContent[]; }

	function buildSearchReturn(opts: SRO) {
		const sc = opts.results.filter(r => !r.error).length;
		const tr = opts.results.reduce((s, r) => s + r.results.length, 0);
		let output = "";
		for (const { query, answer, results, error } of opts.results) {
			if (opts.queryList.length > 1) output += formatQueryHeader(query);
			if (error) output += `Error: ${error}\n\n`;
			else if (results.length === 0) output += "No results found.\n\n";
			else output += formatSearchSummary(results, answer) + "\n\n";
		}
		const hasInlineReady = hasFullInlineCoverage(opts.urls, opts.inlineContent);
		let fetchId: string | null = null;
		if (hasInlineReady && opts.inlineContent) {
			fetchId = generateId();
			storeResult(fetchId, { id: fetchId, type: "fetch", timestamp: Date.now(), urls: opts.inlineContent });
			pi.appendEntry("web-search-results", { id: fetchId, type: "fetch", timestamp: Date.now(), urls: opts.inlineContent });
			output += `---\nFull content for ${opts.inlineContent.length} sources available [${fetchId}].`;
		} else if (opts.includeContent) {
			fetchId = startBackgroundFetch(opts.urls);
			if (fetchId) output += `---\nContent fetching in background [${fetchId}]. Will notify when ready.`;
		}
		const searchId = storeAndPublishSearch(opts.results);
		return { content: [{ type: "text", text: output.trim() }], details: { queries: opts.queryList, queryCount: opts.queryList.length, successfulQueries: sc, totalResults: tr, includeContent: opts.includeContent, fetchId, fetchUrls: fetchId !== null && !hasInlineReady ? opts.urls : undefined, searchId } };
	}

	return {
		name: "web_search", label: "Web Search",
		description: "Search the web using Exa, Brave, Parallel, or Tavily. Returns an AI-synthesized answer with source citations. Each provider needs its own API key (Exa also works zero-config via its MCP). For comprehensive research, prefer queries (plural) with 2-4 varied angles over a single query. When includeContent is true, full page content is fetched in the background. In auto mode, providers are tried in order: Exa, Brave, Parallel, Tavily.",
		promptSnippet: "Use for web research questions. Prefer {queries:[...]} with 2-4 varied angles over a single query for broader coverage.",
		parameters: Type.Object({
			query: Type.Optional(Type.String({ description: "Single search query." })),
			queries: Type.Optional(Type.Array(Type.String(), { description: "Multiple queries searched in sequence." })),
			numResults: Type.Optional(Type.Number({ description: "Results per query (default: 5, max: 20)" })),
			includeContent: Type.Optional(Type.Boolean({ description: "Fetch full page content (async)" })),
			recencyFilter: Type.Optional(StringEnum(["day", "week", "month", "year"], { description: "Filter by recency" })),
			domainFilter: Type.Optional(Type.Array(Type.String(), { description: "Limit to domains (prefix with - to exclude)" })),
			provider: Type.Optional(StringEnum(["auto", "exa", "brave", "parallel", "tavily"], { description: "Search provider (default: auto)" })),
		}),
		async execute(_callId, params, signal, onUpdate) {
			const rawQueryList = Array.isArray(params.queries) ? params.queries : (params.query !== undefined ? [params.query] : []);
			const queryList = normalizeQueryList(rawQueryList);
			if (queryList.length === 0) return { content: [{ type: "text", text: "Error: No query provided." }], details: { error: "No query provided" } };
			const searchResults: QueryResultData[] = []; const allUrls: string[] = []; const allInlineContent: ExtractedContent[] = [];
			const resolvedProvider = normalizeProviderInput(params.provider ?? loadConfig().provider);
			for (let i = 0; i < queryList.length; i++) {
				const query = queryList[i];
				onUpdate?.({ content: [{ type: "text", text: `Searching ${i + 1}/${queryList.length}: "${query}"...` }], details: { phase: "search", progress: i / queryList.length, currentQuery: query } });
				try {
					const { answer, results, inlineContent, provider } = await search(query, { provider: resolvedProvider, numResults: params.numResults, recencyFilter: params.recencyFilter, domainFilter: params.domainFilter, includeContent: params.includeContent, signal });
					searchResults.push({ query, answer, results, error: null, provider });
					for (const r of results) if (!allUrls.includes(r.url)) allUrls.push(r.url);
					if (inlineContent) allInlineContent.push(...inlineContent);
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					searchResults.push({ query, answer: "", results: [], error: message, provider: typeof resolvedProvider === "string" && resolvedProvider !== "auto" ? resolvedProvider : undefined });
				}
			}
			return buildSearchReturn({ queryList, results: searchResults, urls: allUrls, includeContent: params.includeContent ?? false, inlineContent: allInlineContent.length > 0 ? allInlineContent : undefined });
		},
		renderCall(args, theme) {
			const rawQueryList = Array.isArray(args.queries) ? args.queries : (args.query !== undefined ? [args.query] : []);
			const queryList = normalizeQueryList(rawQueryList);
			if (queryList.length === 0) return new Text(theme.fg("toolTitle", theme.bold("search ")) + theme.fg("error", "(no query)"), 0, 0);
			if (queryList.length === 1) { const q = queryList[0]; const d = q.length > 60 ? q.slice(0, 57) + "..." : q; return new Text(theme.fg("toolTitle", theme.bold("search ")) + theme.fg("accent", `"${d}"`), 0, 0); }
			const lines = [theme.fg("toolTitle", theme.bold("search ")) + theme.fg("accent", `${queryList.length} queries`)];
			for (const q of queryList.slice(0, 5)) { const d = q.length > 50 ? q.slice(0, 47) + "..." : q; lines.push(theme.fg("muted", `  "${d}"`)); }
			if (queryList.length > 5) lines.push(theme.fg("muted", `  ... and ${queryList.length - 5} more`));
			return new Text(lines.join("\n"), 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			const d = result.details as any;
			if (isPartial) { const p = d?.progress ?? 0; const bar = "█".repeat(Math.floor(p * 10)) + "░".repeat(10 - Math.floor(p * 10)); return new Text(theme.fg("accent", `[${bar}] ${d?.phase || "searching"}`), 0, 0); }
			if (d?.error) { const plan = buildSearchErrorPlan({ error: d.error }); if (plan) return renderSearchErrorPlan(plan, expanded, theme); return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0); }
			const sc = d?.successfulQueries ?? 0; const tr = d?.totalResults ?? 0;
			const sl = theme.fg("success", `${sc}/${d?.queryCount ?? 0} queries`) + theme.fg("muted", ` (${tr} results)`);
			if (!expanded) return new Text(sl, 0, 0);
			const tc = result.content.find(c => c.type === "text")?.text || ""; const pv = tc.length > 500 ? tc.slice(0, 500) + "..." : tc;
			return new Text(sl + "\n" + theme.fg("dim", pv), 0, 0);
		},
	};
}
