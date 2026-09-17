# Cloudflare Access setup

Cloudflare Access is a gateway that authenticates requests before they reach the Worker. The repository does not create or configure it.

1. Create one Access application for the exact Worker hostname.
2. Protect `/mcp`, `/admin`, and `/admin/api/*`.
3. Add an allow policy for the exact `OWNER_EMAIL` identity. Do not allow Everyone, a whole domain, or an unauthenticated bypass.
4. Apply the same policy to `workers.dev`, preview, and custom hostnames that can reach the Worker.
5. In the Access application's OAuth configuration, enable OAuth and Dynamic Client Registration.
6. Allow `https://chatgpt.com/connector/oauth/*` as a dynamic-registration redirect URI.
7. Set a short OAuth access-token lifetime, such as `15m`. Keep the Access grant lifetime to one or two weeks.

The OAuth configuration is separate from the Access allow policy. It makes Access publish the RFC 9728 protected-resource metadata, OAuth authorization-server metadata, token endpoint, and bearer challenge that remote MCP clients require. Without it, ChatGPT reports that the server does not implement OAuth.

The Worker trusts only the verified platform `ctx.access` principal. It does not trust request headers.

Access reauthorization means that the MCP client obtains a new Access grant. It is separate from Perplexity session authentication. Verify the setup with an unauthenticated request to `/mcp`: it must return `401` and a `WWW-Authenticate` header containing `resource_metadata`. The metadata endpoint must return JSON and identify the Access authorization server.
