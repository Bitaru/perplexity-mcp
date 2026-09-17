# Cloudflare Access setup

Cloudflare Access is a gateway that authenticates requests before they reach the Worker. The repository does not create or configure it.

1. Create one Access application for the exact Worker hostname.
2. Protect `/mcp`, `/admin`, and `/admin/api/*`.
3. Add an allow policy for the exact `OWNER_EMAIL` identity. Do not allow Everyone, a whole domain, or an unauthenticated bypass.
4. Apply the same policy to `workers.dev`, preview, and custom hostnames that can reach the Worker.
5. Configure Managed OAuth and the MCP client with the exact callback URI that Cloudflare shows.

The Worker trusts only the verified platform `ctx.access` principal. It does not trust request headers.

Access reauthorization means that the MCP client obtains a new Access grant. It is separate from Perplexity session authentication. The staging Access gate was observed, but client reauthorization remains unverified.
