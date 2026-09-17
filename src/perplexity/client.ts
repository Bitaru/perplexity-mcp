import { ProviderError } from "./errors";
import { parseProviderJson, type SearchResult } from "./parser";
export type ProviderClient = { search(query: string, cookies: string, signal?: AbortSignal): Promise<SearchResult> };
const maxBodyBytes = 2_000_000;
const askUrl = "https://www.perplexity.ai/rest/sse/perplexity_ask";
const apiVersion = "2.18";
type AskEvent = {
  text?: string;
  error_code?: string;
  error_message?: string;
  blocks?: {
    intended_usage?: string;
    markdown_block?: { answer?: string; chunks?: string[]; chunk_starting_offset?: number };
    web_result_block?: { web_results?: { name?: string; url?: string }[] };
  }[];
  sources_list?: { title?: string; url?: string }[];
};
function parseAskEvents(text: string): SearchResult {
  const events: AskEvent[] = [];
  let data: string[] = [];
  const flush = () => {
    if (!data.length) return;
    const value = data.join("\n");
    data = [];
    if (value === "[DONE]") return;
    try { events.push(JSON.parse(value) as AskEvent); } catch { throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", "malformed SSE payload"); }
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    else if (!line.trim()) flush();
  }
  flush();
  let answer = "";
  let fallbackText = "";
  const sources = new Map<string, { url: string; title?: string }>();
  for (const event of events) {
    if (event.error_code) throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", event.error_message ?? event.error_code);
    if (typeof event.text === "string" && event.text.trim()) fallbackText = event.text;
    for (const block of event.blocks ?? []) {
      const markdown = block.markdown_block;
      if (markdown && (block.intended_usage?.includes("markdown") || block.intended_usage === "ask_text")) {
        if (Array.isArray(markdown.chunks) && markdown.chunks.length) {
          const offset = markdown.chunk_starting_offset ?? 0;
          answer = offset === 0 ? markdown.chunks.join("") : answer.slice(0, offset) + markdown.chunks.join("");
        } else if (typeof markdown.answer === "string" && markdown.answer.trim()) answer = markdown.answer;
      }
      for (const source of block.web_result_block?.web_results ?? []) {
        if (typeof source.url === "string" && /^https?:\/\//.test(source.url)) sources.set(source.url, { url: source.url, ...(typeof source.name === "string" ? { title: source.name } : {}) });
      }
    }
    for (const source of event.sources_list ?? []) {
      if (typeof source.url === "string" && /^https?:\/\//.test(source.url)) sources.set(source.url, { url: source.url, ...(typeof source.title === "string" ? { title: source.title } : {}) });
    }
  }
  return parseProviderJson({ answer: answer || fallbackText, sources: [...sources.values()] });
}
export function createProviderClient(fetcher: typeof fetch = fetch): ProviderClient {
  return { async search(query, cookies, signal) {
    if (!query.trim() || query.length > 2000) throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", "query must be 1-2000 characters");
    if (signal?.aborted) throw new ProviderError("PERPLEXITY_TIMEOUT", "provider request cancelled");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000); const cancel = () => controller.abort(); signal?.addEventListener("abort", cancel, { once: true });
    const requestId = crypto.randomUUID(); const startedAt = Date.now(); let stage = "request"; let responseStatus: number | undefined; let outcome = "error";
    try {
      stage = "build"; const requestInit: RequestInit = { method: "POST", redirect: "manual", headers: {
        "content-type": "application/json", accept: "text/event-stream", origin: "https://www.perplexity.ai", referer: "https://www.perplexity.ai/", "user-agent": "Perplexity/641 CFNetwork/1568 Darwin/25.2.0", "x-request-id": requestId, "x-app-apiclient": "default", "x-app-apiversion": apiVersion, "x-perplexity-request-reason": "submit", ...(cookies ? { cookie: cookies } : {})
      }, body: JSON.stringify({ query_str: query, params: {
        query_str: query, search_focus: "internet", mode: "copilot", model_preference: "experimental", sources: ["web"], attachments: [], frontend_uuid: crypto.randomUUID(), frontend_context_uuid: crypto.randomUUID(), version: apiVersion, language: "en-US", timezone: "UTC", search_recency_filter: null, is_incognito: true, use_schematized_api: true, skip_search_enabled: false, always_search_override: true, prompt_source: "user", source: "default", local_search_enabled: false, should_ask_for_mcp_tool_confirmation: false, supports_tool_approval_modal: false, force_enable_browser_agent: false, is_local_browser_available: false, is_local_browser_allowed: false
      } }), signal: controller.signal };
      let response: Response;
      stage = "fetch"; try { response = await fetcher(askUrl, requestInit); } catch (error) { if (signal?.aborted) throw error; response = await fetcher(askUrl, requestInit); } responseStatus = response.status; stage = "response";
      if (response.status >= 300 && response.status < 400) throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", `provider returned ${response.status}`); if (response.status === 401) throw new ProviderError("PERPLEXITY_AUTH_REQUIRED", "provider authentication required");
      if (response.status === 402) throw new ProviderError("PERPLEXITY_ENTITLEMENT_REQUIRED", "provider entitlement required");
      if (response.status === 403) throw new ProviderError("PERPLEXITY_CHALLENGE_REQUIRED", "provider challenge or access denied");
      if (response.status === 429) throw new ProviderError("PERPLEXITY_RATE_LIMITED", "provider rate limit reached");
      if (response.status >= 500) throw new ProviderError("PERPLEXITY_UNAVAILABLE", `provider returned ${response.status}`);
      if (!response.ok) throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", `provider returned ${response.status}`);
      stage = "stream"; const reader = response.body?.getReader(); if (!reader) throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", "provider response has no body");
      const readChunk = () => new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => { void reader.cancel().catch(() => {}); reject(new Error("cancelled")); };
        controller.signal.addEventListener("abort", abort, { once: true });
        reader.read().then(value => { controller.signal.removeEventListener("abort", abort); resolve(value); }, error => { controller.signal.removeEventListener("abort", abort); reject(error); });
      });
      const chunks: Uint8Array[] = []; let total = 0;
      try { while (true) { const part = await readChunk(); if (part.done) break; total += part.value.byteLength; if (total > maxBodyBytes) throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", "provider response too large"); chunks.push(part.value); } } finally { try { await reader.cancel(); } catch {} reader.releaseLock(); }
      const output = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
      stage = "parse"; const result = parseAskEvents(new TextDecoder().decode(output)); outcome = "ok"; return result;
    } catch (error) { if (error instanceof ProviderError) { outcome = error.code; throw error; } if (controller.signal.aborted) { outcome = "PERPLEXITY_TIMEOUT"; throw new ProviderError("PERPLEXITY_TIMEOUT", "provider request cancelled or timed out"); } outcome = "PERPLEXITY_PROTOCOL_ERROR"; throw new ProviderError("PERPLEXITY_PROTOCOL_ERROR", "provider request failed"); }
    finally { console.log(JSON.stringify({ requestId, stage, outcome, duration: Date.now() - startedAt, statusClass: responseStatus === undefined ? "none" : `${Math.floor(responseStatus / 100)}xx` })); clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
  } };
}
