import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createProviderClient } from "./perplexity/client";

function providerErrorCode(error: unknown): string {
  if (error instanceof Error && error.message === "STALE_LEASE") return "STALE_LEASE";
  if (error instanceof Error && "code" in error) return String(error.code);
  if (error instanceof Error && error.name === "STATE_UNAVAILABLE") return "STATE_UNAVAILABLE";
  return "PROVIDER_ERROR";
}

export function mcpRequest(request: Request, state: DurableObjectStub): Promise<Response> {
  const server = new McpServer({ name: "perplexity-mcp", version: "0.1.0" });
  server.registerTool("search_perplexity", { description: "Search Perplexity using the configured owner session", inputSchema: { query: z.string().min(1).max(2000) } }, async ({ query }) => {
    let lease: { token: string; generation: number };
    try {
      const leaseResponse = await state.fetch(new Request("https://state", { method: "POST", body: JSON.stringify({ op: "acquire", leaseMs: 20_000 }) }));
      if (leaseResponse.status === 409) return { isError: true, content: [{ type: "text", text: "PROVIDER_BUSY: provider search is busy" }] };
      if (!leaseResponse.ok) return { isError: true, content: [{ type: "text", text: "STATE_UNAVAILABLE: lease unavailable" }] };
      const parsed: unknown = await leaseResponse.json();
      if (!parsed || typeof parsed !== "object" || !("token" in parsed) || typeof parsed.token !== "string" || !("generation" in parsed) || typeof parsed.generation !== "number") throw new Error("invalid lease");
      lease = { token: parsed.token, generation: parsed.generation };
    } catch {
      return { isError: true, content: [{ type: "text", text: "STATE_UNAVAILABLE: lease unavailable" }] };
    }
    let result: { isError?: boolean; structuredContent?: Record<string, unknown>; content: { type: "text"; text: string }[] };
    try {
      const statusResponse = await state.fetch(new Request("https://state", { method: "POST", body: JSON.stringify({ op: "status", token: lease.token, generation: lease.generation }) }));
      if (!statusResponse.ok) throw new Error(statusResponse.status === 409 ? "STALE_LEASE" : "STATE_UNAVAILABLE");
      const snapshot: unknown = await statusResponse.json();
      if (!snapshot || typeof snapshot !== "object" || !("active" in snapshot) || snapshot.active === null) {
        return { isError: true, content: [{ type: "text", text: "SETUP_REQUIRED: Perplexity session is not configured" }] };
      }
      if (typeof snapshot.active !== "string") throw new Error("STATE_UNAVAILABLE");
      const search = await createProviderClient(fetch).search(query, snapshot.active, request.signal);
      result = {
        structuredContent: search as unknown as Record<string, unknown>,
        content: [{ type: "text", text: JSON.stringify(search) }, ...search.sources.map(source => ({ type: "text" as const, text: `${source.title ?? "Source"}: ${source.url}` }))],
      };
    } catch (error) {
      const code = providerErrorCode(error);
      result = { isError: true, content: [{ type: "text", text: `${code}: ${error instanceof Error ? error.message : "provider error"}` }] };
    } finally {
      try { await state.fetch(new Request("https://state", { method: "POST", body: JSON.stringify({ op: "release", token: lease.token, generation: lease.generation }) })); } catch { /* primary result wins */ }
    }
    return result;
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  return server.connect(transport).then(() => transport.handleRequest(request));
}
