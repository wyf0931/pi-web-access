import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getWebSearchConfigDir, getWebSearchConfigPath } from "./utils.ts";

export const WEB_SEARCH_CONFIG_PATH = getWebSearchConfigPath();

export interface WebSearchConfig {
	provider?: string;
	webSearch?: { enabled?: boolean };
	ssrf?: { allowRanges?: string[] };
}

export function loadConfig(): WebSearchConfig {
	if (!existsSync(WEB_SEARCH_CONFIG_PATH)) return {};
	const raw = readFileSync(WEB_SEARCH_CONFIG_PATH, "utf-8");
	try { return JSON.parse(raw) as WebSearchConfig; }
	catch (err) { throw new Error(`Failed to parse ${WEB_SEARCH_CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`); }
}

export function saveConfig(updates: Partial<WebSearchConfig>): void {
	let config: Record<string, unknown> = {};
	if (existsSync(WEB_SEARCH_CONFIG_PATH)) {
		const raw = readFileSync(WEB_SEARCH_CONFIG_PATH, "utf-8");
		try { config = JSON.parse(raw) as Record<string, unknown>; }
		catch (err) { throw new Error(`Failed to parse ${WEB_SEARCH_CONFIG_PATH}: ${err instanceof Error ? err.message : String(err)}`); }
	}
	Object.assign(config, updates);
	const dir = getWebSearchConfigDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	writeFileSync(WEB_SEARCH_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function loadConfigForExtensionInit(): WebSearchConfig {
	try { return loadConfig(); }
	catch (err) { console.error(`[pi-web-access] ${err instanceof Error ? err.message : String(err)}`); return {}; }
}
