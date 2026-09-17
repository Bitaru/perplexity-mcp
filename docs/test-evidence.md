# Test evidence

The following checks ran in the local checkout on 2026-09-17. They used synthetic data and mocked provider authentication responses. A separate staging check exercised the deployed Worker.

| Check | Result and evidence |
|---|---|
| `npm run typecheck` | PASS. TypeScript completed without diagnostics. |
| `npm test` | PASS. Vitest completed 10 files and 38 tests. Coverage includes provider response bounds, MCP lease and error paths, email login, authenticator challenges, login rate limits, semantic admin markup, error recovery markup, state migration, and stale-operation rejection. |
| `npm run smoke` | PASS. Missing configuration failed closed. |
| `npm run diagnose` | PASS. Configuration presence was reported without secret values. |
| `npm run check-template` | PASS. Required files, Deploy Button link, binding metadata, and Wrangler protection fields were checked. |
| `npm run check-secrets` | PASS. Heuristic scan completed. This is not a security proof. |
| `npx wrangler deploy --dry-run` | PASS. Wrangler built the Worker without deploying it. |
| Cloudflare deployment | PASS on staging. Version `44fd09b7-17af-4488-9e31-c61bf0be84e1` deployed. Access presented its sign-in gate. |
| Post-migration provider login and search | NOT RUN on the current version. The provider session is disconnected, and `search_perplexity` returned `SETUP_REQUIRED`. Version `32f0ae65-0b3d-41e9-a79a-2b239a4a97f1` passed before disconnection. |
| Deploy Button, Access reauthorization, and live authenticator challenge | NOT RUN. These require a new deployment or separate owner interaction. |

Automatic provider login passed live staging email-code flows before and after the storage cutover. Synthetic authenticator tests also passed. Access reauthorization and token refresh are separate behaviors and remain unverified.
