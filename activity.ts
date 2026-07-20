// Lightweight in-memory activity logging used by the search/fetch providers.
// Each provider calls logStart -> logComplete/logError around its network calls.
// (The TUI activity widget that previously rendered these entries was removed;
// the logging surface is retained because every provider depends on it.)

export interface ActivityEntry {
	id: string;
	type: "api" | "fetch";
	startTime: number;
	endTime?: number;
	query?: string;
	url?: string;
	status: number | null;
	error?: string;
}

export interface RateLimitInfo {
	used: number;
	max: number;
	oldestTimestamp: number | null;
	windowMs: number;
}

export class ActivityMonitor {
	private entries: ActivityEntry[] = [];
	private readonly maxEntries = 10;
	private rateLimitInfo: RateLimitInfo = { used: 0, max: 10, oldestTimestamp: null, windowMs: 60000 };
	private nextId = 1;

	logStart(partial: Omit<ActivityEntry, "id" | "startTime" | "status">): string {
		const id = `act-${this.nextId++}`;
		const entry: ActivityEntry = {
			...partial,
			id,
			startTime: Date.now(),
			status: null,
		};
		this.entries.push(entry);
		if (this.entries.length > this.maxEntries) {
			this.entries.shift();
		}
		return id;
	}

	logComplete(id: string, status: number): void {
		const entry = this.entries.find((e) => e.id === id);
		if (entry) {
			entry.endTime = Date.now();
			entry.status = status;
		}
	}

	logError(id: string, error: string): void {
		const entry = this.entries.find((e) => e.id === id);
		if (entry) {
			entry.endTime = Date.now();
			entry.error = error;
		}
	}

	updateRateLimit(info: RateLimitInfo): void {
		this.rateLimitInfo = info;
	}

	clear(): void {
		this.entries = [];
		this.rateLimitInfo = { used: 0, max: 10, oldestTimestamp: null, windowMs: 60000 };
	}
}

export const activityMonitor = new ActivityMonitor();
