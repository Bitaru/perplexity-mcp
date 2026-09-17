# Current state

## Evidence boundary

This report covers the local checkout, an authorized staging deployment, and a read-only comparison with the production Worker. No credential, cookie, email code, authenticator code, query, or answer was recorded.

## Implemented local behavior

The Worker uses Cloudflare's platform `getIdentity()` for owner checks. It serves Streamable HTTP MCP traffic, Cloudflare-encrypted Durable Object state, operation leases, admin CSRF controls, provider parsing, and cookie handling. The protected admin page starts Perplexity email login, handles an authenticator challenge, saves the session, and disconnects stored state. `/mcp` is POST-only in the intended protocol path.

A previous staging version returned live Perplexity search results after the owner completed email-code login. Version `44fd09b7-17af-4488-9e31-c61bf0be84e1` labels the initial connection screen as step 1 of 2 and removes its encryption notice. The provider session is currently disconnected, so the current version returned `SETUP_REQUIRED` when asked to search.

## Unverified claims

Deploy Button prompts, Access reauthorization, token refresh, a live authenticator challenge, and production rollback require separate authorized tests.

## Recovery

Cloudflare manages encryption at rest, so there is no user encryption key to preserve or recover. Use admin disconnect to clear stored state. Roll back to a known-good Worker version when required.
