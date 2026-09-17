# Deployment

The Deploy Button opens Cloudflare's deployment flow for this repository. It does not provision Cloudflare Access or prove that the Worker can search Perplexity.

Required input:

- `OWNER_EMAIL`, the one identity allowed by Access.

Cloudflare encrypts Durable Object data and metadata at rest. The deployer does not create or manage a storage encryption key.

After deployment, manually configure one owner-only Access application for every reachable hostname. Protect `/mcp`, `/admin`, and `/admin/api/*`. Disable or protect preview URLs and `workers.dev` routes. Do not expose an alternate hostname without the same policy.

Use `/admin` only after Access authenticates the owner. Enter the Perplexity account email, then enter the email code. If Perplexity requires an authenticator code, enter it on the next page.

Rollback by selecting a known-good Worker version in Cloudflare and redeploying it. Use the authenticated admin disconnect operation to remove stored provider state.

Staging version `44fd09b7-17af-4488-9e31-c61bf0be84e1` deployed successfully. The provider session is currently disconnected, so a live provider search requires a new login. Deploy Button provisioning, Access reauthorization, and a live authenticator challenge still require separate tests.
