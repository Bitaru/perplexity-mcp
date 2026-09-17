# Compatibility

Local checks ran on 2026-09-17 with these pinned packages:

- Node `>=22.6.0` for `node --experimental-strip-types`.
- `@modelcontextprotocol/sdk` `1.30.0`.
- `@cloudflare/workers-types` `5.20260917.1`.
- TypeScript `7.0.2`.
- Vitest `5.0.1`.
- Wrangler `4.133.0`.

The target is Cloudflare Workers with SQLite-backed Durable Objects and compatibility date `2026-09-17`. The MCP endpoint accepts POST requests and exposes `search_perplexity`. Results use canonical JSON text and source blocks.

The admin page supports Perplexity email codes and authenticator challenges. A live staging email login completed, and the resulting session completed an MCP search. Local tests cover the optional authenticator challenge with synthetic responses. Deploy Button provisioning, Access reauthorization, subscription entitlements, SSO, and a live authenticator challenge still require separate account tests.
