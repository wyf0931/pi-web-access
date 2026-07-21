import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { fetchAllContent, type ExtractedContent } from "../extract/extract.ts";
import { normalizeFetchContentParams } from "../extract/fetch-params.ts";
import { generateId, storeResult, type StoredSearchData } from "../infra/storage.ts";
import { buildSearchErrorPlan, renderSearchErrorPlan, type ToolTheme, MAX_INLINE_CONTENT } from "../infra/rendering.ts";

export interface FetchContentToolDeps { pi: ExtensionAPI; }

export function createFetchContentTool({ pi }: FetchContentToolDeps) {
	return {
		name: "fetch_content", label: "Fetch Content",
		description: "Fetch URL(s) and extract readable content as markdown. Falls back to Jina Reader then Parallel for pages that block bots or fail Readability extraction. Content is always stored and can be retrieved with get_search_content.",
		promptSnippet: "Use to extract readable content from URL(s).",
		parameters: Type.Object({
			url: Type.Optional(Type.String({ description: "Single URL to fetch" })),
			urls: Type.Optional(Type.Array(Type.String(), { description: "Multiple URLs (parallel)" })),
		}),

		async execute(_callId, params, signal, onUpdate) {
			const { urlList, options } = normalizeFetchContentParams(params);
			if (urlList.length === 0) {
				return { content: [{ type: "text", text: "Error: No URL provided." }], details: { error: "No URL provided" } };
			}
			onUpdate?.({ content: [{ type: "text", text: `Fetching ${urlList.length} URL(s)...` }], details: { phase: "fetch", progress: 0 } });

			const fetchResults = await fetchAllContent(urlList, signal, options);
			const successful = fetchResults.filter(r => !r.error).length;
			const totalChars = fetchResults.reduce((s, r) => s + r.content.length, 0);
			const responseId = generateId();
			const data: StoredSearchData = { id: responseId, type: "fetch", timestamp: Date.now(), urls: fetchResults };
			storeResult(responseId, data);
			pi.appendEntry("web-search-results", data);

			if (urlList.length === 1) {
				const result = fetchResults[0];
				if (result.error) {
					return { content: [{ type: "text", text: `Error: ${result.error}` }], details: { urls: urlList, urlCount: 1, successful: 0, error: result.error, responseId } };
				}
				const fullLength = result.content.length;
				const truncated = fullLength > MAX_INLINE_CONTENT;
				let output = truncated ? result.content.slice(0, MAX_INLINE_CONTENT) + "\n\n[Content truncated...]" : result.content;
				if (truncated) output += `\n\n---\nShowing ${MAX_INLINE_CONTENT} of ${fullLength} chars. Use get_search_content({ responseId: "${responseId}", urlIndex: 0 }) for full content.`;
				return { content: [{ type: "text", text: output }], details: { urls: urlList, urlCount: 1, successful: 1, totalChars: fullLength, title: result.title, responseId, truncated } };
			}

			let output = "## Fetched URLs\n\n";
			for (const { url, title, content, error } of fetchResults) {
				output += error ? `- ${url}: Error - ${error}\n` : `- ${title || url} (${content.length} chars)\n`;
			}
			output += `\n---\nUse get_search_content({ responseId: "${responseId}", urlIndex: 0 }) to retrieve full content.`;
			return { content: [{ type: "text", text: output }], details: { urls: urlList, urlCount: urlList.length, successful, totalChars, responseId } };
		},

		renderCall(args, theme) {
			const { url, urls } = args as any;
			const urlList: string[] = urls ?? (url ? [url] : []);
			if (urlList.length === 0) return new Text(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("error", "(no URL)"), 0, 0);
			const lines: string[] = [];
			if (urlList.length === 1) {
				const d = urlList[0].length > 60 ? urlList[0].slice(0, 57) + "..." : urlList[0];
				lines.push(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", d));
			} else {
				lines.push(theme.fg("toolTitle", theme.bold("fetch ")) + theme.fg("accent", `${urlList.length} URLs`));
				for (const u of urlList.slice(0, 5)) { const d = u.length > 60 ? u.slice(0, 57) + "..." : u; lines.push(theme.fg("muted", "  " + d)); }
				if (urlList.length > 5) lines.push(theme.fg("muted", `  ... and ${urlList.length - 5} more`));
			}
			return new Text(lines.join("\n"), 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const d = result.details as any;
			if (isPartial) { const p = d?.progress ?? 0; const bar = "█".repeat(Math.floor(p * 10)) + "░".repeat(10 - Math.floor(p * 10)); return new Text(theme.fg("accent", `[${bar}] ${d?.phase || "fetching"}`), 0, 0); }
			if (d?.error) {
				const extras: string[] = [];
				if (typeof d.urlCount === "number") extras.push(`urls: ${d.successful ?? 0}/${d.urlCount} succeeded`);
				if (d.responseId) extras.push(`response id: ${d.responseId}`);
				if (d.urls?.length > 0) { for (const u of d.urls.slice(0, 8)) extras.push(`  ▸ ${u}`); if (d.urls.length > 8) extras.push(`  ... and ${d.urls.length - 8} more`); }
				const plan = buildSearchErrorPlan({ error: d.error, extraLines: extras });
				if (plan) return renderSearchErrorPlan(plan, expanded, theme);
				return new Text(theme.fg("error", `Error: ${d.error}`), 0, 0);
			}
			if (d?.urlCount === 1) {
				const title = d?.title || "Untitled";
				let sl = theme.fg("success", title) + theme.fg("muted", ` (${d?.totalChars ?? 0} chars)`);
				if (d?.truncated) sl += theme.fg("warning", " [truncated]");
				const tc = result.content.find(c => c.type === "text")?.text || "";
				const pv = !expanded ? (tc.length > 200 ? tc.slice(0, 200) + "..." : tc) : (tc.length > 500 ? tc.slice(0, 500) + "..." : tc);
				return new Text(sl + "\n" + theme.fg("dim", pv), 0, 0);
			}
			const cc = (d?.successful ?? 0) > 0 ? "success" : "error";
			const sl = theme.fg(cc, `${d?.successful}/${d?.urlCount} URLs`) + theme.fg("muted", " (content stored)");
			if (!expanded) return new Text(sl, 0, 0);
			const tc = result.content.find(c => c.type === "text")?.text || ""; const pv = tc.length > 500 ? tc.slice(0, 500) + "..." : tc;
			return new Text(sl + "\n" + theme.fg("dim", pv), 0, 0);
		},
	};
}
