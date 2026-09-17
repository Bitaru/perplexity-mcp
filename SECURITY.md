# Security

Report vulnerabilities privately to the repository owner. Do not disclose cookies, OTPs, authorization headers, or provider responses in issues or logs.

The Worker fails closed without valid configuration and a trusted Cloudflare Access identity. Cloudflare encrypts Durable Object data and metadata at rest with Cloudflare-managed keys. This does not protect against malicious deployed code or a Cloudflare administrator who can replace the Worker. See [Durable Objects data security](https://developers.cloudflare.com/durable-objects/reference/data-security/).

The Worker does not forward inbound authorization, cookie, or Access headers to the provider. The secret scan is a heuristic review aid, not proof that a repository contains no credentials.

Consumer-session automation can be restricted by provider terms and is not an official API integration. Provider consumer email login is unsupported. The documented live checks apply only to the staging account and flows that were tested.
