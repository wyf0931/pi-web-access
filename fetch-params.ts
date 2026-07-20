export interface FetchContentParams {
	url?: unknown;
	urls?: unknown;
	forceClone?: unknown;
}

export interface NormalizedFetchContentParams {
	urlList: string[];
	options: {
		forceClone?: boolean;
	};
}

export function normalizeFetchContentParams(params: FetchContentParams): NormalizedFetchContentParams {
	const normalizedUrls = uniqueUrls(normalizeUrlArray(params.urls));
	const urlList = normalizedUrls.length > 0 ? normalizedUrls : normalizeSingleUrl(params.url);

	return {
		urlList,
		options: {
			forceClone: typeof params.forceClone === "boolean" ? params.forceClone : undefined,
		},
	};
}

function normalizeUrlArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap(normalizeSingleUrl);
}

function normalizeSingleUrl(value: unknown): string[] {
	if (typeof value !== "string") return [];
	const trimmed = value.trim();
	return trimmed ? [trimmed] : [];
}

function uniqueUrls(urls: string[]): string[] {
	return [...new Set(urls)];
}
