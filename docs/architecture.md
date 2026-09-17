# Architecture

The Worker serves Streamable HTTP MCP traffic at `/mcp` and a protected owner control plane at `/admin`. One deterministic SQLite-backed Durable Object stores Perplexity session state and coordination data. Cloudflare encrypts its data and metadata at rest. It does not store queries or answers.

Cloudflare Access is the only application identity boundary. The Worker accepts a principal only from the platform access context and requires an exact match with `OWNER_EMAIL`. Missing or mismatched identity fails closed. Inbound cookies and authorization headers never go to the provider.

The protected admin page starts Perplexity email login and completes an authenticator challenge when Perplexity requires one. It stores the resulting consumer session cookie in the Durable Object. There is no API billing fallback or challenge bypass.

Disconnect removes this deployment's stored provider state. It does not revoke a provider session outside this deployment. Access reauthorization is separate from provider session reauthentication and from token refresh.
