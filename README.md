# Perplexity MCP on Cloudflare

## What it is

This project uses **Perplexity consumer authentication**. It is **not an official** Perplexity API integration. Perplexity can change or restrict this flow.

This project runs a private Perplexity search tool on Cloudflare Workers. ChatGPT or another MCP client can call one tool, `search_perplexity`.

Cloudflare Access limits the Worker to one email address. The Worker signs in to Perplexity by email code and supports an authenticator code when required.

Cloudflare encrypts Durable Object data and metadata at rest with Cloudflare-managed keys. The MCP client never receives the Perplexity cookie. See [Durable Objects data security](https://developers.cloudflare.com/durable-objects/reference/data-security/).

## Installation

You need:

- A Cloudflare account with Workers and Zero Trust enabled.
- A Perplexity account that can sign in by email.
- A ChatGPT plan that supports custom MCP apps, or another remote MCP client.
- The email address that will own the Worker.

OpenAI documents current plan support in [Developer mode and MCP apps in ChatGPT](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt).


### 1. Deploy the Worker

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Bitaru/perplexity-mcp)

1. Select the button above and sign in to Cloudflare.
2. Set `OWNER_EMAIL` to the one email address that can use the Worker.
3. Finish the deployment.
4. Copy the Worker URL. It looks like `https://perplexity-mcp.<your-subdomain>.workers.dev`.

The Deploy button creates the Worker and its Durable Object. It does not create the Cloudflare Access policy.

### 2. Protect the Worker with Cloudflare Access

Do not use the Worker until this step is complete. An incorrect policy can expose the MCP endpoint.

1. In Cloudflare, open Workers & Pages.
2. Select the deployed Worker.
3. Open the Access tab.
4. Select Protect this Worker behind Access.
5. Select All traffic.
6. Create an Allow policy for the exact `OWNER_EMAIL`.
7. Do not allow Everyone or a complete email domain.
8. Apply Access.

Worker-level Access protects the `workers.dev` address, routes, custom domains, and preview addresses. See [Cloudflare Access for Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

Open the new Access application in Cloudflare Zero Trust. Under its OAuth configuration:

1. Enable OAuth.
2. Enable Dynamic Client Registration.
3. Allow this redirect URI:

```text
https://chatgpt.com/connector/oauth/*
```

Use a short Access token lifetime, such as 15 minutes. A grant lifetime of one or two weeks reduces repeated sign-ins.

This OAuth setting is required for remote MCP clients. Without it, Access serves a browser login page or a 403 response, and ChatGPT reports that the server does not implement OAuth. Do not select `No authentication` in ChatGPT while the Worker is protected by Access.

### 3. Connect the Perplexity account

1. Open `<Worker URL>/admin`.
2. Sign in through Cloudflare Access with `OWNER_EMAIL`.
3. Enter the email address for the Perplexity account.
4. Select Send login code.
5. Enter the code that Perplexity sends by email.
6. If Perplexity asks for an authenticator code, enter it on the next page.
7. Make sure that the page shows `Provider session: Connected`.

The Perplexity email can differ from `OWNER_EMAIL`. The Worker does not put email codes or authenticator codes in the MCP conversation.

### 4. Add the app to ChatGPT

ChatGPT uses custom MCP apps on the web.

1. In ChatGPT, open Settings.
2. Open Apps, then Advanced settings.
3. Enable Developer mode.
4. Open Apps and select Create.
5. Enter a name such as `Perplexity MCP`.
6. Enter `<Worker URL>/mcp` as the MCP server URL.
7. Select OAuth authentication.
8. Select Scan tools.
9. Sign in through Cloudflare Access when ChatGPT opens the authorization page.
10. Create the app.

Start a new chat and select the app from the tools menu. Ask a current-information question to call `search_perplexity`.

## How it works

The setup uses two separate sign-ins. Cloudflare Access proves who can use the Worker. Perplexity authentication creates the private search session.

```text
One-time setup

  Owner browser
       |
       | 1. Open /admin
       v
  Cloudflare Access ---- exact OWNER_EMAIL policy
       |
       | 2. Verified identity
       v
  Worker admin page
       |
       | 3. Email code, then authenticator code if required
       v
  Perplexity authentication
       |
       | 4. Session cookie
       v
  OwnerState Durable Object
       |
       | Cloudflare-managed encryption at rest
```

```text
Each search

  ChatGPT or MCP client
       |
       | OAuth and MCP request
       v
  Cloudflare Access
       |
       | Verified owner identity
       v
  Worker /mcp
       |
       | Lease, load session, send search
       v
  Perplexity
       |
       | Answer and source links
       v
  Worker normalizes the result
       |
       v
  MCP client
```

The Worker does not forward inbound `Authorization`, `Cookie`, or `Cf-Access-*` headers to Perplexity. It sends only the session that the admin login created.

## Local development

Local development requires Node.js 22.6 or newer.

```sh
npm install
cp .dev.vars.example .dev.vars
npm run typecheck
npm test
npm run smoke
npm run check-template
npm run check-secrets
npm run dev
```

Set `OWNER_EMAIL` in `.dev.vars`. Never commit real values.

## License

This project uses the [MIT License](LICENSE).
