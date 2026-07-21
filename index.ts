import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfigForExtensionInit } from "./config.ts";
import { clearResults, restoreFromSession } from "./infra/storage.ts";
import { abortPendingFetches, setSessionActive } from "./session.ts";
import { createWebSearchTool } from "./tools/web-search.ts";
import { createFetchContentTool } from "./tools/fetch-content.ts";
import { createGetContentTool } from "./tools/get-content.ts";

export default function (pi: ExtensionAPI) {
	const initConfig = loadConfigForExtensionInit();

	if (initConfig.webSearch?.enabled !== false) {
		pi.registerTool(createWebSearchTool({ pi }));
	}
	pi.registerTool(createFetchContentTool({ pi }));
	pi.registerTool(createGetContentTool());

	function handleSessionChange(_ctx: ExtensionContext): void {
		abortPendingFetches();
		setSessionActive(true);
		restoreFromSession(_ctx);
	}

	pi.on("session_start", async (_event, ctx) => handleSessionChange(ctx));
	pi.on("session_tree", async (_event, ctx) => handleSessionChange(ctx));
	pi.on("session_shutdown", () => {
		setSessionActive(false);
		abortPendingFetches();
		clearResults();
	});
}
