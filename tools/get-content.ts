import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { ExtractedContent } from "../extract.ts";
import { getResult, type QueryResultData } from "../storage.ts";
import { buildSearchErrorPlan, renderSearchErrorPlan, type ToolTheme, formatFullResults } from "../rendering.ts";

export function createGetContentTool() {
	return {
		name: "get_search_content", label: "Get Search Content",
		description: "Retrieve full content from a previous web_search or fetch_content call.",
		promptSnippet: "Use after web_search/fetch_content when full stored content is needed via responseId plus query/url selectors.",
		parameters: Type.Object({
			responseId: Type.String({ description: "The responseId from web_search or fetch_content" }),
			query: Type.Optional(Type.String({ description: "Get content for this query (web_search)" })),
			queryIndex: Type.Optional(Type.Number({ description: "Get content for query at index" })),
			url: Type.Optional(Type.String({ description: "Get content for this URL" })),
			urlIndex: Type.Optional(Type.Number({ description: "Get content for URL at index" })),
		}),

		async execute(_callId, params) {
			const data = getResult(params.responseId);
			if (!data) return { content: [{ type: "text", text: `Error: No stored results for "${params.responseId}"` }], details: { error: "Not found", responseId: params.responseId } };

			if (data.type === "search" && data.queries) {
				let queryData: QueryResultData | undefined;
				if (params.query !== undefined) {
					queryData = data.queries.find(q => q.query === params.query);
					if (!queryData) return { content: [{ type: "text", text: `Query "${params.query}" not found. Available: ${data.queries.map(q => `"${q.query}"`).join(", ")}` }], details: { error: "Query not found" } };
				} else if (params.queryIndex !== undefined) {
					queryData = data.queries[params.queryIndex];
					if (!queryData) return { content: [{ type: "text", text: `Index ${params.queryIndex} out of range (0-${data.queries.length - 1})` }], details: { error: "Index out of range" } };
				} else {
					return { content: [{ type: "text", text: `Specify query or queryIndex. Available: ${data.queries.map((q, i) => `${i}: "${q.query}"`).join(", ")}` }], details: { error: "No query specified" } };
				}
				if (queryData.error) return { content: [{ type: "text", text: `Error for "${queryData.query}": ${queryData.error}` }], details: { error: queryData.error, query: queryData.query } };
				return { content: [{ type: "text", text: formatFullResults(queryData) }], details: { query: queryData.query, resultCount: queryData.results.length } };
			}

			if (data.type === "fetch" && data.urls) {
				let urlData: ExtractedContent | undefined;
				if (params.url !== undefined) {
					urlData = data.urls.find(u => u.url === params.url);
					if (!urlData) return { content: [{ type: "text", text: `URL not found. Available:\n  ${data.urls.map(u => u.url).join("\n  ")}` }], details: { error: "URL not found" } };
				} else if (params.urlIndex !== undefined) {
					urlData = data.urls[params.urlIndex];
					if (!urlData) return { content: [{ type: "text", text: `Index ${params.urlIndex} out of range (0-${data.urls.length - 1})` }], details: { error: "Index out of range" } };
				} else {
					return { content: [{ type: "text", text: `Specify url or urlIndex. Available:\n  ${data.urls.map((u, i) => `${i}: ${u.url}`).join("\n  ")}` }], details: { error: "No URL specified" } };
				}
				if (urlData.error) return { content: [{ type: "text", text: `Error for ${urlData.url}: ${urlData.error}` }], details: { error: urlData.error, url: urlData.url } };
				return { content: [{ type: "text", text: `# ${urlData.title}\n\n${urlData.content}` }], details: { url: urlData.url, title: urlData.title, contentLength: urlData.content.length } };
			}

			return { content: [{ type: "text", text: "Invalid stored data format" }], details: { error: "Invalid data" } };
		},

		renderCall(args, theme) {
			const { responseId, query, queryIndex, url, urlIndex } = args as any;
			let target = "";
			if (query) target = `query="${query}"`;
			else if (queryIndex !== undefined) target = `queryIndex=${queryIndex}`;
			else if (url) target = (url as string).length > 30 ? (url as string).slice(0, 27) + "..." : url;
			else if (urlIndex !== undefined) target = `urlIndex=${urlIndex}`;
			return new Text(theme.fg("toolTitle", theme.bold("get_content ")) + theme.fg("accent", target || (responseId as string).slice(0, 8)), 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const d = result.details as any;
			if (d?.error) {
				const extras: string[] = [];
				if (d.query) extras.push(`query: ${d.query}`);
				if (d.url) extras.push(`url: ${d.url}`);
				else if (d.title) extras.push(`resource: ${d.title}`);
				const plan = buildSearchErrorPlan({ error: d.error, extraLines: extras });
				if (plan) return renderSearchErrorPlan(plan, expanded, theme);
				return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0);
			}
			const sl = d?.query
				? theme.fg("success", `"${d.query}"`) + theme.fg("muted", ` (${d.resultCount} results)`)
				: theme.fg("success", d?.title || "Content") + theme.fg("muted", ` (${d?.contentLength ?? 0} chars)`);
			if (!expanded) return new Text(sl, 0, 0);
			const tc = result.content.find(c => c.type === "text")?.text || "";
			const pv = tc.length > 500 ? tc.slice(0, 500) + "..." : tc;
			return new Text(sl + "\n" + theme.fg("dim", pv), 0, 0);
		},
	};
}
