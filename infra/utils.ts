import { homedir } from "node:os";
import { join } from "node:path";

export function getWebSearchConfigDir(): string {
	// Align with Pi's unified config directory.
	// PI_CODING_AGENT_DIR defaults to ~/.pi/agent; respect it when set.
	// Otherwise fall back to XDG or the Pi default directly.
	if (process.env.PI_CODING_AGENT_DIR) return process.env.PI_CODING_AGENT_DIR;
	if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "pi");
	return join(homedir(), ".pi", "agent");
}

export function getWebSearchConfigPath(): string {
	return join(getWebSearchConfigDir(), "web-search.json");
}
