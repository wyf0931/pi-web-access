import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { getWebSearchConfigDir, getWebSearchConfigPath } from "./infra/utils.ts";

export const WEB_SEARCH_CONFIG_PATH = getWebSearchConfigPath();

/** Everything user-configurable, loaded once and cached. */
export interface AppConfig {
	exaApiKey?: string;
	braveApiKey?: string;
	parallelApiKey?: string;
	tavilyApiKey?: string;
	provider?: string;
	webSearch?: { enabled?: boolean };
	ssrf?: { allowRanges?: string[] };
}

let cached: AppConfig | null = null;

function loadOnce(): AppConfig {
	if (cached) return cached;
	if (!existsSync(WEB_SEARCH_CONFIG_PATH)) {
		cached = {};
		return cached;
	}
	const raw = readFileSync(WEB_SEARCH_CONFIG_PATH, "utf-8");
	try { cached = JSON.parse(raw) as AppConfig; }
	catch (err) { const m = err instanceof Error ? err.message : String(err); console.error(`[pi-web-access] Failed to parse ${WEB_SEARCH_CONFIG_PATH}: ${m}`); cached = {}; }
	return cached;
}

export function loadConfig(): AppConfig { return loadOnce(); }

export function saveConfig(updates: Partial<AppConfig>): void {
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
	cached = null; // bust cache on save
}

export function loadConfigForExtensionInit(): AppConfig {
	return loadOnce();
}

// --- typed API key getters (env var first, then config file) ---

function normalizeKey(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const v = value.trim();
	return v.length > 0 ? v : null;
}

function fromEnvOrConfig(envKey: string, configField: keyof AppConfig): string | null {
	return normalizeKey(process.env[envKey]) ?? normalizeKey(loadOnce()[configField]);
}

function requireFromEnvOrConfig(envKey: string, configField: keyof AppConfig, label: string): string {
	const key = fromEnvOrConfig(envKey, configField);
	if (!key) {
		throw new Error(
			`${label} API key not found. Either:\n` +
			`  1. Create ${WEB_SEARCH_CONFIG_PATH} with { "${configField}": "your-key" }\n` +
			`  2. Set ${envKey} environment variable`,
		);
	}
	return key;
}

export function getExaApiKey(): string | null {
	return fromEnvOrConfig("EXA_API_KEY", "exaApiKey");
}

export function getBraveApiKey(): string | null {
	return fromEnvOrConfig("BRAVE_API_KEY", "braveApiKey");
}

const PARALLEL_MIN_KEY_LENGTH = 8;
const PARALLEL_PLACEHOLDER_DENYLIST = new Set(["your-parallel-api-key", "your_api_key", "pk_live_your_key", "placeholder", "your-key", "your-key-here", "dummy", "changeme", "insert-your-key", "insert-your-key-here", "api-key", "xxx"]);

function isParallelPlaceholder(key: string): boolean {
	const n = key.trim();
	return n.length < PARALLEL_MIN_KEY_LENGTH || PARALLEL_PLACEHOLDER_DENYLIST.has(n.toLowerCase());
}

export function getParallelApiKey(): string {
	const envKey = normalizeKey(process.env.PARALLEL_API_KEY);
	if (envKey && !isParallelPlaceholder(envKey)) return envKey;
	const configKey = normalizeKey(loadOnce().parallelApiKey);
	if (configKey && !isParallelPlaceholder(configKey)) return configKey;
	throw new Error(
		"Parallel API key not found. Either:\n" +
		`  1. Create ${WEB_SEARCH_CONFIG_PATH} with { "parallelApiKey": "your-key" }\n` +
		"  2. Set PARALLEL_API_KEY environment variable\n" +
		"Get a key at https://platform.parallel.ai",
	);
}

export function getTavilyApiKey(): string {
	const key = fromEnvOrConfig("TAVILY_API_KEY", "tavilyApiKey");
	if (!key) {
		throw new Error(
			"Tavily API key not found. Either:\n" +
			`  1. Create ${WEB_SEARCH_CONFIG_PATH} with { "tavilyApiKey": "your-key" }\n` +
			"  2. Set TAVILY_API_KEY environment variable\n" +
			"Get a key at https://app.tavily.com/",
		);
	}
	return key;
}
