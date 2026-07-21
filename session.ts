export const pendingFetches = new Map<string, AbortController>();
export let sessionActive = false;
export function setSessionActive(active: boolean): void { sessionActive = active; }
export function abortPendingFetches(): void {
	for (const controller of pendingFetches.values()) controller.abort();
	pendingFetches.clear();
}
