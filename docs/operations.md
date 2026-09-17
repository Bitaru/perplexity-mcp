# Operations

Use the protected `/admin` page to connect or disconnect Perplexity. Enter the Perplexity email code and an authenticator code when required. Cloudflare encrypts the saved Durable Object data at rest. Run search through the MCP client only after the page shows `Provider session: Connected`.

Disconnect removes local stored state. It does not revoke a session held by the provider. Access reauthorization is managed by Cloudflare and is separate from provider session reauthentication and token refresh.

Logs must contain only a correlation ID, stage, outcome, duration, and status class. Never log cookies, OTPs, authorization headers, queries, or answers.

There is no user-managed storage encryption key. If stored state is unavailable or incompatible, reconnect through the protected admin page. Do not disable verification.

Staging version `44fd09b7-17af-4488-9e31-c61bf0be84e1` deployed successfully. The provider session is currently disconnected, so reconnect through the protected admin page before a live search. Deploy Button provisioning, Access reauthorization, a live authenticator challenge, and rollback still require separate operational tests.
