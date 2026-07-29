import { Text } from "@earendil-works/pi-tui";
import { buildSearchErrorPlan, type SearchErrorPlan } from "./render-search-error.ts";
import type { SearchResult } from "./types.ts";
import type { ExtractedContent } from "./../extract/extract.ts";
import type { QueryResultData } from "./storage.ts";

export { buildSearchErrorPlan, type SearchErrorPlan } from "./render-search-error.ts";
export const MAX_INLINE_CONTENT = 30000;

export interface ToolTheme {
	fg(key: string, s: string): string;
	bg(key: string, s: string): string;
}

export function renderSearchErrorPlan(plan: SearchErrorPlan, expanded: boolean, theme: ToolTheme): Text {
	if (expanded) {
		return new Text(plan.expanded.map((l, i) => i === 0 ? theme.fg("error", l) : theme.fg("toolOutput", l)).join("\n"), 0, 0);
	}
	const lines = [theme.fg("error", plan.expanded[0])];
	for (const line of plan.collapsed) lines.push(theme.fg("dim", line));
	if (plan.expandHint) lines.push(theme.fg("muted", plan.expandHint));
	return new Text(lines.join("\n"), 0, 0);
}

export function formatSearchSummary(results: SearchResult[], answer: string): string {
	let output = answer ? `${answer}\n\n---\n\n**Sources:**\n` : "";
	output += results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}`).join("\n\n");
	return output;
}

export function formatQueryHeader(query: string): string { return `## Query: "${query}"\n\n`; }

export function hasFullInlineCoverage(urls: string[], inlineContent: ExtractedContent[] | undefined): boolean {
	if (!inlineContent || inlineContent.length === 0) return false;
	const coveredUrls = new Set(inlineContent.map(c => c.url));
	return urls.every(url => coveredUrls.has(url));
}

export function formatFullResults(queryData: QueryResultData): string {
	let output = `## Results for: "${queryData.query}"\n\n`;
	if (queryData.answer) output += `${queryData.answer}\n\n---\n\n`;
	for (const r of queryData.results) output += `### ${r.title}\n${r.url}\n\n`;
	return output;
}

export function extractDomain(url: string): string {
	try { return new URL(url).hostname; } catch { return url; }
}
