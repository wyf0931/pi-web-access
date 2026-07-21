<p>
  <img src="banner.png" alt="pi-web-access" width="1100">
</p>

# Pi Web Access

**A lightweight web search & URL fetch bridge for the Pi agent. Exa, Brave, Parallel, or Tavily — dedicated search APIs, bring your own keys.**

[![npm version](https://img.shields.io/npm/v/pi-web-access?style=for-the-badge)](https://www.npmjs.com/package/pi-web-access)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

## Why Pi Web Access

**Professional search APIs only** — Every provider is a dedicated search-as-a-service API designed for programmatic use. No repurposed LLM "grounding", no cross-product subscription reuse, no client-side rate-limit throttling.

**Pure API bridge** — No browser, no cookies, no Chromium, no `ffmpeg`, no `yt-dlp`, no local `git` clones. Just HTTP search APIs and URL → markdown extraction. Runs anywhere (Docker, WSL, SSH, headless).

**Zero-config option** — Exa works out of the box via its MCP (no API key). Add an Exa/Brave/Parallel/Tavily key for direct API access and higher quotas.

**Smart fallbacks** — In `auto` mode, search tries Exa → Brave → Parallel → Tavily until one succeeds. Blocked pages retry through Jina Reader and Parallel extraction. Something always works.

## Install

```bash
pi install npm:pi-web-access
```

Works immediately with no API keys — Exa MCP provides zero-config search. For direct API access, add a key to `~/.pi/web-search.json`:

```json
{
  "exaApiKey": "exa-...",
  "braveApiKey": "BSA_...",
  "parallelApiKey": "...",
  "tavilyApiKey": "tvly-..."
}
```

Requires Pi v0.37.3+. No system binaries required.

## Quick Start

```typescript
// Search the web
web_search({ query: "TypeScript best practices 2025" })

// Search multiple angles at once
web_search({ queries: ["React vs Vue performance 2026", "React vs Vue DX comparison"] })

// Fetch a page as markdown
fetch_content({ url: "https://docs.example.com/guide" })

// Retrieve full stored content later
get_search_content({ responseId: "abc123", urlIndex: 0 })
```

## Tools

### web_search

Search the web via Exa, Brave, Parallel, or Tavily. Returns a synthesized answer with source citations.

```typescript
web_search({ query: "rust async programming" })
web_search({ queries: ["query 1", "query 2"] })
web_search({ query: "latest news", numResults: 10, recencyFilter: "week" })
web_search({ query: "...", domainFilter: ["github.com"] })
web_search({ query: "...", provider: "brave" })
web_search({ query: "...", includeContent: true })
```

| Parameter | Description |
|-----------|-------------|
| `query` / `queries` | Single query or batch of queries |
| `numResults` | Results per query (default: 5, max: 20) |
| `recencyFilter` | `day`, `week`, `month`, or `year` |
| `domainFilter` | Limit to domains (prefix with `-` to exclude) |
| `provider` | `auto` (default), `exa`, `brave`, `parallel`, or `tavily` |
| `includeContent` | Fetch full page content from sources in background |

In `auto` mode (default), `web_search` tries Exa (direct API if keyed, MCP if not), then Brave, Parallel, and Tavily.

### fetch_content

Fetch URL(s) and extract readable content as markdown. Detects regular web pages and JS-rendered SPAs.

```typescript
fetch_content({ url: "https://example.com/article" })
fetch_content({ urls: ["url1", "url2", "url3"] })
```

| Parameter | Description |
|-----------|-------------|
| `url` / `urls` | Single URL or multiple URLs (fetched in parallel) |

### get_search_content

Retrieve stored content from previous searches or fetches. Content over 30,000 chars is truncated in tool responses but stored in full for retrieval here.

```typescript
get_search_content({ responseId: "abc123", urlIndex: 0 })
get_search_content({ responseId: "abc123", url: "https://..." })
get_search_content({ responseId: "abc123", query: "original query" })
```

## Capabilities

### Search providers

| Provider | Auth | Notes |
|----------|------|-------|
| **Exa** | `EXA_API_KEY` (optional) | Neural search built for AI. Direct API with key; zero-config MCP without. |
| **Brave Search API** | `BRAVE_API_KEY` | Independent index, dedicated search API. |
| **Parallel** | `PARALLEL_API_KEY` | AI search; also serves as a fetch fallback. |
| **Tavily** | `TAVILY_API_KEY` | Search API built for LLM agents. |

### Blocked / JS-rendered pages

When Readability fails or returns only a cookie notice, the extension retries via Jina Reader (handles JS rendering server-side, no API key needed), then Parallel extraction. Handles SPAs, JS-heavy pages, and anti-bot protections transparently. Also parses Next.js RSC flight data when present.

## How It Works

```
web_search(query)
  → Exa → Brave → Parallel → Tavily   (auto fallback by availability)

fetch_content(url)
  → HTTP fetch → HTML? Readability → RSC parser → Jina Reader → Parallel fallback
               → Text/JSON/Markdown? Return directly
```

## Configuration

Config defaults to `~/.pi/web-search.json`, or `web-search.json` under `PI_CODING_AGENT_DIR` / `XDG_CONFIG_HOME/pi` when set. Every field is optional.

```json
{
  "exaApiKey": "exa-...",
  "braveApiKey": "BSA_...",
  "parallelApiKey": "...",
  "tavilyApiKey": "tvly-...",
  "provider": "auto",
  "webSearch": {
    "enabled": true
  },
  "ssrf": {
    "allowRanges": ["198.18.0.0/15"]
  }
}
```

`EXA_API_KEY`, `BRAVE_API_KEY`, `PARALLEL_API_KEY`, and `TAVILY_API_KEY` env vars take precedence over config file values.

`provider` sets the default search provider: `"auto"` (default), `"exa"`, `"brave"`, `"parallel"`, or `"tavily"`. Set `webSearch.enabled` to `false` to unregister the `web_search` tool while leaving fetch/content tools available. `ssrf.allowRanges` lists CIDR ranges (e.g. `"198.18.0.0/15"`, `"fd00::/8"`) exempted from the SSRF guard that otherwise blocks private/reserved IP ranges. This unblocks `fetch_content`/`web_search` on hosts whose network proxy runs in TUN + fake-IP mode (Surge, Clash, Mihomo, Stash, ...). It is **off by default** — the guard stays fully enabled unless you list ranges here. Use the narrowest range that covers your proxy's fake-IP pool. All-address CIDRs such as `0.0.0.0/0` and `::/0` are rejected.

Config changes require a Pi restart. Content fetches run 3 concurrent with a 30s timeout per URL.

## Limitations

- GitHub URLs are fetched as rendered HTML like any other URL (no local cloning).
- YouTube URLs are fetched as the public watch page (no transcript/frame extraction).

<details>
<summary>Files</summary>

| File | Purpose |
|------|---------|
| `index.ts` | Extension entry, tool definitions |
| `search.ts` | Search router — provider fallback chain |
| `types.ts` | Shared search types (`SearchResult`, `SearchResponse`, `SearchOptions`) |
| `brave.ts` | Brave Search API provider |
| `parallel.ts` | Parallel search provider and extraction fallback |
| `tavily.ts` | Tavily Search API provider |
| `exa.ts` | Exa.ai search provider — direct API and MCP proxy |
| `extract.ts` | URL routing, HTTP extraction, fallback orchestration |
| `rsc-extract.ts` | RSC flight data parser for Next.js pages |
| `ssrf-protection.ts` | SSRF guard for fetch URL validation |
| `render-search-error.ts` | Expandable error rendering for tool results |
| `fetch-params.ts` | fetch_content parameter normalization |
| `utils.ts` | Shared formatting and error helpers |
| `storage.ts` | Session-aware result storage |
| `activity.ts` | In-memory request logging used by providers |

</details>
