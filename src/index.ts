import { loadConfig, type Env } from "./config";
import { mcpRequest } from "./mcp";
import { admin } from "./admin";
import { requireOwner } from "./access";
export { OwnerState } from "./owner-state";
type Bindings = Env & { OWNER_STATE: DurableObjectNamespace };
type WorkerContext = ExecutionContext & { access?: { getIdentity(): Promise<{ email?: unknown } | undefined> } };
export default { async fetch(request: Request, env: Bindings, ctx: WorkerContext): Promise<Response> {
  let config; try { config = loadConfig(env); } catch (error) { return new Response(error instanceof Error ? error.message : "setup required", { status: 503, headers: { "cache-control": "no-store" } }); }
  const url = new URL(request.url); if (url.pathname === "/") return new Response("Perplexity MCP is configured behind Cloudflare Access. Use /mcp or /admin.", { headers: { "cache-control": "no-store" } });
  try { await requireOwner(ctx, config.ownerEmail); } catch { return new Response("unauthorized", { status: 401 }); }
  const stub = env.OWNER_STATE.get(env.OWNER_STATE.idFromName(`owner-state:${config.deployment}`));
  if (url.pathname === "/mcp") return mcpRequest(request, stub);
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return admin(request, env, stub, ctx, url.pathname);
  return new Response("not found", { status: 404 });
} };
