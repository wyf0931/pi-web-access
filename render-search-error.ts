/**
 * Pure, dependency-free renderer for web_search / fetch_content / get_search_content
 * error results.
 *
 * WHY THIS EXISTS: a tool `renderResult` that early-returns a SINGLE line on the
 * error path makes Ctrl+O (app.tools.expand) flip `expanded` with zero visible
 * effect — a dead-end with no diagnostics. This module produces an error/collapsed/
 * expanded PLAN (plain strings, no theme/ANSI) so it is unit-testable without pi's
 * runtime. index.ts.renderResult delegates to it and only applies theme colors.
 *
 * Contract for callers:
 *   const plan = buildSearchErrorPlan(details);
 *   if (plan === null) ... // not an error result; use the normal renderer
 *   // collapsed: [statusLine, ...plan.collapsed, plan.expandHint].filter(Boolean)
 *   // expanded:  plan.expanded
 */

export interface SearchErrorDetails {
	/** The headline error message. */
	error?: string;
	/** Arbitrary extra diagnostic lines (e.g. URLs, response id). Shown in the
	 * expanded view and previewed when collapsed. */
	extraLines?: string[];
}

export interface SearchErrorPlan {
	/** Full diagnostic block, shown when expanded (Ctrl+O). */
	expanded: string[];
	/** Short preview lines, shown under the headline when collapsed. */
	collapsed: string[];
	/** The "... (N more lines, ctrl+o to expand)" hint, or null if nothing is hidden. */
	expandHint: string | null;
}

function truncate(text: string, max: number): string {
	return text.length > max ? text.slice(0, max - 1) + "\u2026" : text;
}

/**
 * Build the error render plan. Returns null when `details` carries no error signal
 * (so the caller falls through to the normal success renderer).
 */
export function buildSearchErrorPlan(details: SearchErrorDetails | undefined | null): SearchErrorPlan | null {
	if (!details || !details.error) {
		return null;
	}

	const headline = details.error;
	const extras = details.extraLines ?? [];

	// A bare argument error (e.g. "No URL provided") stays a clean single line.
	if (extras.length === 0) {
		return { expanded: [headline], collapsed: [], expandHint: null };
	}

	const expanded: string[] = [headline, "", "Details:"];
	for (const e of extras) expanded.push(`  ${e}`);

	// Collapsed preview: first one or two detail lines.
	const collapsed = extras.slice(0, 2).map(e => truncate(e, 100));

	const hiddenLines = Math.max(0, expanded.length - (1 + collapsed.length)); // headline + preview shown when collapsed
	const expandHint = hiddenLines > 0
		? `... (${hiddenLines} more lines, ${expanded.length} total, ctrl+o to expand)`
		: null;

	return { expanded, collapsed, expandHint };
}
