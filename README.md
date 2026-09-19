# Perplexity MCP on Cloudflare

Use Perplexity search from ChatGPT or another MCP client. You deploy one private Worker in your Cloudflare account.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Bitaru/perplexity-mcp)

[Model Context Protocol (MCP)](https://modelcontextprotocol.io/docs/getting-started/intro) lets AI clients call external tools. This server gives a client one read-only tool named `search_perplexity`.

For example, ChatGPT can ask Perplexity a current web question and return the answer with its source links. You stay in the same chat.

## Why this project exists

Perplexity and ChatGPT are useful for different types of research. This project connects them through a small server that you own.

The Worker uses your Perplexity consumer session. It does not need a Perplexity API key or Perplexity API billing.

The design is for one person and one deployment. Your Cloudflare account controls the server, its access policy, and its saved session.

## Before you deploy

This project is an unofficial integration. It uses Perplexity consumer authentication, not the official Perplexity API.

Perplexity can change or block this login flow. Use this project only if the access method fits your account and obligations.

Do not run this Worker as a public or shared service. Its security model allows one owner email address.

## What you get

- ChatGPT and other remote MCP clients can call `search_perplexity`.
- The tool returns the Perplexity answer and its source links.
- A protected `/admin` page connects or disconnects the Perplexity account.
- Cloudflare Access limits the Worker to the exact owner email address.
- A Durable Object stores the Perplexity session. Cloudflare encrypts its data and metadata at rest.
- The Worker does not store search queries or answers.

## Requirements

You need:

- A Cloudflare account with Workers and Zero Trust enabled.
- A Perplexity account that supports email sign-in.
- One email address that will own the Worker.
- ChatGPT with custom MCP app support, or another remote MCP client.

OpenAI changes custom app availability by plan. Read [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt) for current access rules.

## Installation

The setup has four parts. You deploy the Worker, protect it, connect Perplexity, and add it to your MCP client.

### 1. Deploy the Worker

1. Select the Deploy to Cloudflare button near the top of this page.
2. Sign in to Cloudflare.
3. Set `OWNER_EMAIL` to the exact email address that will use the Worker.
4. Finish the deployment.
5. Copy the Worker URL.

The URL usually looks like this:

```text
https://perplexity-mcp.<your-subdomain>.workers.dev
```

The deployment creates the Worker and its Durable Object. It does not create the Cloudflare Access policy.

### 2. Protect the Worker with Cloudflare Access

Do not use `/admin` or `/mcp` before you complete this section. A missing Access policy exposes the Worker endpoint.

1. Open Workers & Pages in the Cloudflare dashboard.
2. Select the deployed `perplexity-mcp` Worker.
3. Open the Access tab.
4. Select Protect this Worker behind Access.
5. Select All traffic.
6. Create an Allow policy for the exact `OWNER_EMAIL`.
7. Remove policies that allow Everyone or a complete email domain.
8. Apply Access.

Worker-level Access protects the `workers.dev` address, routes, custom domains, and preview addresses. Cloudflare explains this setup in [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Next, configure OAuth for the generated Access application:

1. Open Cloudflare Zero Trust.
2. Open Access, then Applications.
3. Select the application for the Worker.
4. Open its OAuth configuration.
5. Enable OAuth.
6. Enable Dynamic Client Registration.
7. Add this allowed redirect URI:

```text
https://chatgpt.com/connector/oauth/*
```

Dynamic Client Registration lets ChatGPT register itself with Access. Without it, ChatGPT reports that the server does not implement OAuth.

Use a short Access token lifetime, such as 15 minutes. A grant lifetime of one or two weeks reduces repeated sign-ins.

Do not select `No authentication` in ChatGPT. The Worker requires OAuth through Cloudflare Access.

### 3. Connect your Perplexity account

1. Open `<Worker URL>/admin` in your browser.
2. Sign in through Cloudflare Access with `OWNER_EMAIL`.
3. Enter the email address for your Perplexity account.
4. Select Send login code.
5. Enter the code that Perplexity sends by email.
6. If Perplexity asks for an authenticator code, enter it on the next page.
7. Make sure that the page shows `Provider session: Connected`.

The Perplexity email address can differ from `OWNER_EMAIL`. The Worker never puts email codes or authenticator codes in an MCP conversation.

### 4. Add the app to ChatGPT

ChatGPT connects to remote MCP servers from its web app. The exact menu depends on your plan and workspace role.

1. Enable Developer mode for your ChatGPT account.
2. Open Settings, then Apps.
3. Select Create.
4. Enter a name such as `Perplexity MCP`.
5. Enter `<Worker URL>/mcp` as the MCP server URL.
6. Select OAuth authentication.
7. Select Scan tools.
8. Sign in through Cloudflare Access when ChatGPT opens the authorization page.
9. Create the app.

If Create is missing, ask the workspace administrator to enable Developer mode. An administrator can also use Workspace settings, Apps, then Create.

Start a new chat and select the app from the tools menu. Ask ChatGPT to use Perplexity for a current-information question.

For example:

```text
Use Perplexity to find the latest Cloudflare Workers announcements. Include the source links.
```

## Other MCP clients

Use this server URL:

```text
<Worker URL>/mcp
```

The client must support remote Streamable HTTP servers and OAuth. It must also work with Dynamic Client Registration from Cloudflare Access.

## How it works

The setup uses two separate sign-ins. Cloudflare Access identifies the Worker owner. Perplexity authentication creates the private search session.

```text
One-time setup

  Owner browser
       |
       | Open /admin
       v
  Cloudflare Access
       |
       | Match the exact OWNER_EMAIL
       v
  Worker admin page
       |
       | Email code and optional authenticator code
       v
  Perplexity
       |
       | Consumer session
       v
  SQLite-backed Durable Object
```

Each search follows this path:

```text
ChatGPT or another MCP client
       |
       | OAuth and MCP request
       v
Cloudflare Access
       |
       | Verified owner identity
       v
Worker /mcp
       |
       | Load the saved session and send the query
       v
Perplexity
       |
       | Answer and source links
       v
MCP client
```

## Security model

- Cloudflare Access authenticates every request before the Worker handles it.
- The Worker trusts only the identity in Cloudflare `ctx.access`.
- The identity email must exactly match `OWNER_EMAIL`.
- The MCP client never receives the saved Perplexity cookie.
- The Worker never forwards inbound authorization, cookie, or Access headers to Perplexity.
- Cloudflare encrypts Durable Object data and metadata at rest with Cloudflare-managed keys.
- Disconnecting in `/admin` removes the saved state from this deployment.

Disconnecting does not revoke a session that Perplexity holds outside this Worker. Read [SECURITY.md](SECURITY.md) before you expose a new hostname.

## Limits

- This project supports one owner and one saved Perplexity session.
- The Worker runs one provider search at a time.
- Perplexity can expire the session. Reconnect it through `/admin`.
- The integration has no official API fallback.
- Subscription features, SSO, and provider account restrictions can produce different results.
- The Deploy Button flow and live authenticator challenge still need broader account testing.

## Troubleshooting

If ChatGPT says that the server does not implement OAuth, enable OAuth and Dynamic Client Registration in the Access application. Add `https://chatgpt.com/connector/oauth/*` as an allowed redirect URI.

If Cloudflare denies access, make sure that the signed-in email exactly matches `OWNER_EMAIL`. Also remove broad or bypass policies.

If the tool returns `SETUP_REQUIRED`, open `<Worker URL>/admin` and connect Perplexity again.

If the tool returns `PROVIDER_BUSY`, wait for the active search to finish. Then run the request again.

If the tool returns `STATE_UNAVAILABLE`, inspect the Cloudflare status and Worker logs. Do not put cookies, codes, queries, or provider responses in reports.

Read [the troubleshooting guide](docs/troubleshooting.md) for more error details.

## Local development

Local development requires Node.js 22.6 or newer.

```sh
git clone https://github.com/Bitaru/perplexity-mcp.git
cd perplexity-mcp
npm install
cp .dev.vars.example .dev.vars
```

Set `OWNER_EMAIL` in `.dev.vars`. Never commit real local values.

Run the local validation commands:

```sh
npm run typecheck
npm test
npm run smoke
npm run check-template
npm run check-secrets
npx wrangler deploy --dry-run
```

Start the local Worker:

```sh
npm run dev
```

Protected routes need a simulated Cloudflare Access identity during local development. See [Test `ctx.access` locally](https://developers.cloudflare.com/workers/configuration/cloudflare-access/#test-ctxaccess-locally).

## Project documentation

- [Architecture](docs/architecture.md) describes the trust boundaries and saved state.
- [Deployment](docs/deployment.md) describes release and rollback steps.
- [Cloudflare Access setup](docs/access-setup.md) describes the required identity and OAuth policy.
- [Operations](docs/operations.md) describes connection, disconnection, and log rules.
- [Compatibility](docs/compatibility.md) lists tested versions and untested account flows.
- [Test evidence](docs/test-evidence.md) records the latest local and staging results.

## License

This project uses the [MIT License](LICENSE).
