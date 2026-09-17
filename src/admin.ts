import { requireOwner } from "./access";
import { z } from "zod";
import type { Env } from "./config";
import {
  ProviderAuthError,
  startEmailLogin,
  verifyAuthenticatorCode,
  verifyEmailCode,
  type LoginAttempt,
} from "./perplexity/auth";

const base = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "referrer-policy": "same-origin",
  "x-content-type-options": "nosniff",
};
const maxVerificationAttempts = 5;
const loginAttemptSchema = z.object({
  v: z.literal(1),
  stage: z.enum(["email", "totp"]),
  email: z.string(),
  cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string(),
    hostOnly: z.boolean(),
    secure: z.boolean().optional(),
    expires: z.number().optional(),
  })),
  createdAt: z.number(),
  expiresAt: z.number(),
  verifyAttempts: z.number(),
  csrfToken: z.string().optional(),
  challengeToken: z.string().optional(),
});
const adminStyles = `
:root {
  color-scheme: light;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
  color: #172033;
  background: #eef2ff;
  --ink: #101828;
  --muted: #667085;
  --line: rgba(23, 32, 51, .10);
  --primary: #5146e5;
  --primary-dark: #4338ca;
}
* { box-sizing: border-box; }
body {
  min-height: 100vh;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(20px, 6vw, 72px) 20px;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 8% 0%, rgba(129, 140, 248, .24), transparent 30rem),
    radial-gradient(circle at 100% 100%, rgba(56, 189, 248, .16), transparent 34rem),
    linear-gradient(135deg, #f5f7ff 0%, #edf2ff 48%, #f3faff 100%);
}
body::before {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  content: "";
  background-image: linear-gradient(rgba(255, 255, 255, .24) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, .24) 1px, transparent 1px);
  background-size: 32px 32px;
  mask-image: linear-gradient(to bottom, black, transparent 78%);
}
main { width: min(100%, 620px); }
.card {
  padding: clamp(24px, 5vw, 40px);
  border: 1px solid rgba(255, 255, 255, .80);
  border-radius: 30px;
  background: rgba(255, 255, 255, .88);
  box-shadow: 0 1px 2px rgba(23, 32, 51, .04), 0 24px 80px rgba(23, 32, 51, .13), inset 0 1px 0 rgba(255, 255, 255, .90);
  backdrop-filter: blur(18px);
}
.brand {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 30px;
}
.mark {
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 15px;
  color: #fff;
  background: linear-gradient(145deg, #6257f1, #4338ca);
  font-size: 20px;
  font-weight: 800;
  box-shadow: 0 10px 22px rgba(79, 70, 229, .28), inset 0 1px 0 rgba(255, 255, 255, .28);
}
.eyebrow, .section-label {
  margin: 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
  letter-spacing: .12em;
  line-height: 1.3;
  text-transform: uppercase;
}
.brand h1 {
  margin: 3px 0 0;
  color: var(--ink);
  font-size: clamp(28px, 5vw, 38px);
  line-height: 1.08;
  letter-spacing: -.045em;
  text-wrap: balance;
}
h2 {
  margin: 5px 0 0;
  color: var(--ink);
  font-size: 21px;
  line-height: 1.25;
  letter-spacing: -.025em;
  text-wrap: balance;
}
p { color: #475467; line-height: 1.6; text-wrap: pretty; }
.status-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 0 0 12px;
  padding: 17px 18px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: rgba(249, 250, 251, .82);
}
.status-copy { margin: 4px 0 0; color: #344054; font-size: 15px; font-weight: 700; line-height: 1.3; }
.status-detail { margin: 3px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 7px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 750;
  white-space: nowrap;
}
.status::before { width: 8px; height: 8px; border-radius: 50%; content: ""; }
.status.connected { color: #067647; background: #ecfdf3; }
.status.connected::before { background: #12b76a; box-shadow: 0 0 0 3px rgba(18, 183, 106, .14); }
.status.disconnected { color: #b54708; background: #fffaeb; }
.status.disconnected::before { background: #f79009; box-shadow: 0 0 0 3px rgba(247, 144, 9, .14); }
.result-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 4px 20px;
  color: var(--muted);
  font-size: 12px;
}
.result-note strong { color: #344054; font-weight: 700; }
.result-note::before { width: 6px; height: 6px; border-radius: 50%; background: #98a2b3; content: ""; }
.result-note.success::before { background: #12b76a; }
.panel {
  padding: clamp(20px, 4vw, 26px);
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255, 255, 255, .72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .90);
}
.panel-heading { margin-bottom: 4px; }
.panel > p { margin: 12px 0 0; font-size: 15px; }
.security-note {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 18px;
  padding: 11px 12px;
  border: 1px solid #dbe4ff;
  border-radius: 12px;
  color: #475467;
  background: #f5f7ff;
  font-size: 12px;
  line-height: 1.5;
}
.security-note svg { width: 16px; height: 16px; flex: 0 0 auto; margin-top: 1px; color: #5146e5; }
form { margin-top: 20px; }
.stack { display: grid; gap: 14px; }
label { display: grid; gap: 8px; color: #344054; font-size: 13px; font-weight: 700; }
input {
  width: 100%;
  min-height: 50px;
  padding: 12px 14px;
  border: 1px solid #d0d5dd;
  border-radius: 13px;
  color: var(--ink);
  background: rgba(255, 255, 255, .96);
  font: inherit;
  outline: none;
  box-shadow: 0 1px 2px rgba(16, 24, 40, .04);
  transition-property: border-color, box-shadow, background-color;
  transition-duration: 140ms;
}
input::placeholder { color: #98a2b3; }
input:focus { border-color: #8178f0; background: #fff; box-shadow: 0 0 0 4px rgba(99, 102, 241, .14); }
button, .button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  padding: 12px 17px;
  border: 1px solid transparent;
  border-radius: 13px;
  font: inherit;
  font-size: 14px;
  font-weight: 750;
  text-decoration: none;
  cursor: pointer;
  transition-property: background-color, border-color, box-shadow, color, transform;
  transition-duration: 140ms;
}
button:active, .button:active { transform: scale(.96); }
button:focus-visible, .button:focus-visible { outline: 3px solid rgba(99, 102, 241, .30); outline-offset: 3px; }
.primary { width: 100%; color: #fff; background: linear-gradient(180deg, #5b50ed, var(--primary)); box-shadow: 0 9px 18px rgba(79, 70, 229, .22), inset 0 1px 0 rgba(255, 255, 255, .20); }
.primary:hover { background: linear-gradient(180deg, #5146e5, var(--primary-dark)); box-shadow: 0 11px 22px rgba(79, 70, 229, .27), inset 0 1px 0 rgba(255, 255, 255, .20); }
.secondary { color: #344054; border-color: #d0d5dd; background: rgba(255, 255, 255, .82); }
.secondary:hover { color: var(--ink); border-color: #98a2b3; background: #fff; }
.danger { color: #b42318; border-color: #fecdca; background: rgba(255, 255, 255, .82); }
.danger:hover { background: #fef3f2; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
.actions form { margin: 0; }
.disconnect-form, .disconnect-form .danger { width: 100%; }
.footer { display: flex; align-items: center; justify-content: center; gap: 7px; margin: 22px 4px 0; color: var(--muted); font-size: 11px; text-align: center; }
.footer-dot { width: 5px; height: 5px; border-radius: 50%; background: #98a2b3; }
.error-card h1 { margin-bottom: 12px; }
.error-card > p { margin: 0 0 16px; }
.error-card .security-note { margin: 0 0 20px; }
.error-card .button { width: 100%; }
@media (max-width: 520px) {
  body { align-items: flex-start; padding: 16px 12px 28px; }
  .card { border-radius: 24px; }
  .status-panel { align-items: flex-start; flex-direction: column; gap: 12px; }
  .status { align-self: flex-start; }
  .actions, .actions form, .actions button { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  input, button, .button { transition-duration: 0ms; }
}
`;

type AccessContext = { access?: { getIdentity(): Promise<{ email?: unknown } | undefined> } };
type Lease = { token: string; generation: number };
type PublicStatus = {
  active: boolean;
  pending: boolean;
  pendingStage: "email" | "totp" | null;
  lastTest?: { status: string; timestamp: number; code?: string } | null;
};
type StateSnapshot = { pending: unknown | null; pendingStage: "email" | "totp" | null };

class AdminError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function documentPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="/admin/styles.css"></head><body>${body}</body></html>`;
}

function stateRequest(state: DurableObjectStub, body: Record<string, unknown>): Promise<Response> {
  return state.fetch(new Request("https://owner-state/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function acquire(state: DurableObjectStub, op = "acquire"): Promise<Lease> {
  const response = await stateRequest(state, { op, leaseMs: 45_000 });
  if (!response.ok) {
    if (response.status === 429) throw new AdminError("Too many login emails were requested. Wait and try again.", 429);
    if (response.status === 409) throw new AdminError("Another provider update is in progress. Try again.", 409);
    throw new AdminError("Provider state is unavailable.", 503);
  }
  return response.json() as Promise<Lease>;
}

async function release(state: DurableObjectStub, lease: Lease, op = "release"): Promise<void> {
  try { await stateRequest(state, { op, ...lease }); } catch { /* lease expiry recovers automatically */ }
}

async function loadPending(state: DurableObjectStub, lease: Lease): Promise<LoginAttempt> {
  const response = await stateRequest(state, { op: "status", ...lease });
  if (!response.ok) throw new AdminError("The login request changed. Reload the page.", 409);
  const snapshot: unknown = await response.json();
  if (!snapshot || typeof snapshot !== "object" || !("pending" in snapshot) || !("pendingStage" in snapshot) || !snapshot.pending || !snapshot.pendingStage) {
    throw new AdminError("No Perplexity login is waiting for a code.", 409);
  }
  const parsed = loginAttemptSchema.safeParse(snapshot.pending);
  if (!parsed.success || parsed.data.stage !== snapshot.pendingStage) throw new AdminError("The saved login request is unavailable. Start again.", 409);
  return parsed.data;
}

async function savePending(state: DurableObjectStub, lease: Lease, attempt: LoginAttempt, sent = false): Promise<void> {
  const response = await stateRequest(state, { op: "pending-save", stage: attempt.stage, value: attempt, sent, ...lease });
  if (!response.ok) throw new AdminError("The login request could not be saved.", 503);
}

async function saveSession(state: DurableObjectStub, lease: Lease, cookies: string): Promise<void> {
  const response = await stateRequest(state, { op: "save", value: cookies, ...lease });
  if (!response.ok) throw new AdminError("The Perplexity session could not be saved.", 503);
}

function errorResponse(error: unknown): Response {
  const message = error instanceof ProviderAuthError || error instanceof AdminError ? error.message : "The provider login failed.";
  const status = error instanceof AdminError ? error.status : error instanceof ProviderAuthError && error.code === "AUTH_UNAVAILABLE" ? 502 : 400;
  const body = `<main><section class="card error-card" aria-labelledby="error-title"><header class="brand"><span class="mark" aria-hidden="true">P</span><div><p class="eyebrow">Private MCP</p><h1 id="error-title">Perplexity login</h1></div></header><p>${escapeHtml(message)}</p><div class="security-note"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.9 8.2-7 10-4.1-1.8-7-5.4-7-10V6l7-3Z"/><path d="m9.2 12 1.8 1.8 3.8-4"/></svg><span>Your session stays inside the protected Worker.</span></div><a class="button primary" href="/admin">Return to setup</a></section></main>`;
  return new Response(documentPage("Perplexity login", body), {
    status,
    headers: { ...base, "content-type": "text/html; charset=utf-8" },
  });
}

function redirectAdmin(request: Request): Response {
  return Response.redirect(new URL("/admin", request.url), 303);
}

function hiddenCsrf(token: string): string {
  return `<input type="hidden" name="csrf" value="${escapeHtml(token)}">`;
}

function adminHtml(status: PublicStatus, csrf: string, ownerEmail: string): string {
  const stateLabel = status.active ? "Connected" : "Not connected";
  const stateClass = status.active ? "connected" : "disconnected";
  const stateDetail = status.active ? "Ready to use for search." : "Connect a session to enable search.";
  const providerEmail = escapeHtml(ownerEmail);
  let login = "";
  if (status.pending && status.pendingStage === "email") {
    login = `<div class="panel-heading"><p class="section-label">Step 2 of 2</p><h2 id="connection-title">Check your inbox</h2></div><p id="connection-description">Enter the one-time code sent to your Perplexity email.</p><form class="stack" method="post" aria-labelledby="connection-title" aria-describedby="connection-description">${hiddenCsrf(csrf)}<input type="hidden" name="action" value="verify-code"><label for="email-code">Perplexity email code</label><input id="email-code" name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="32"><button class="primary" type="submit">Verify email code</button></form>`;
  } else if (status.pending && status.pendingStage === "totp") {
    login = `<div class="panel-heading"><p class="section-label">Additional verification</p><h2 id="connection-title">Confirm your authenticator</h2></div><p id="connection-description">Open the authenticator app linked to Perplexity and enter its current code.</p><form class="stack" method="post" aria-labelledby="connection-title" aria-describedby="connection-description">${hiddenCsrf(csrf)}<input type="hidden" name="action" value="verify-code"><label for="authenticator-code">Authenticator code</label><input id="authenticator-code" name="code" inputmode="numeric" autocomplete="one-time-code" required maxlength="32"><button class="primary" type="submit">Verify authenticator</button></form>`;
  } else if (!status.active) {
    login = `<div class="panel-heading"><p class="section-label">Step 1 of 2</p><h2 id="connection-title">Connect Perplexity</h2></div><p id="connection-description">Use your Perplexity email to create a private search session. It can differ from your Cloudflare Access email.</p><form class="stack" method="post" aria-labelledby="connection-title" aria-describedby="connection-description">${hiddenCsrf(csrf)}<input type="hidden" name="action" value="start-login"><label for="provider-email">Perplexity email</label><input id="provider-email" type="email" name="email" autocomplete="email" value="${providerEmail}" placeholder="you@example.com" required maxlength="320"><button class="primary" type="submit">Send login code</button></form>`;
  }
  const cancel = status.pending ? `<form method="post">${hiddenCsrf(csrf)}<input type="hidden" name="action" value="cancel-login"><button class="secondary" type="submit">Cancel login</button></form>` : "";
  const disconnect = status.active ? `<form class="disconnect-form" method="post">${hiddenCsrf(csrf)}<input type="hidden" name="action" value="disconnect"><button class="danger" type="submit">Disconnect Perplexity</button></form>` : "";
  const last = status.lastTest ? `<p class="result-note ${status.lastTest.status === "ok" ? "success" : ""}" role="status">Last provider test <strong>${escapeHtml(status.lastTest.status)}${status.lastTest.code ? ` (${escapeHtml(status.lastTest.code)})` : ""}</strong></p>` : "";
  const connection = login ? `<section class="panel" aria-labelledby="connection-title">${login}</section>` : "";
  const actions = cancel || disconnect ? `<div class="actions" aria-label="Session actions">${cancel}${disconnect}</div>` : "";
  const body = `<main><section class="card" aria-labelledby="page-title"><header class="brand"><span class="mark" aria-hidden="true">P</span><div><p class="eyebrow">Private MCP</p><h1 id="page-title">Perplexity setup</h1></div></header><section class="status-panel" aria-labelledby="session-label" role="status" aria-live="polite" aria-atomic="true"><div><p class="section-label">Connection</p><p id="session-label" class="status-copy">Provider session</p><p class="status-detail">${stateDetail}</p></div><span class="status ${stateClass}">${stateLabel}</span></section>${last}${connection}${actions}<footer class="footer"><span class="footer-dot" aria-hidden="true"></span><span>Protected by Cloudflare Access</span><span aria-hidden="true">·</span><span>${escapeHtml(ownerEmail)}</span></footer></section></main>`;
  return documentPage("Perplexity MCP setup", body);
}

export async function admin(
  request: Request,
  env: Env,
  state: DurableObjectStub,
  ctx: AccessContext,
  route = "/admin",
  providerFetch: typeof fetch = fetch,
): Promise<Response> {
  let principal: string;
  try { principal = await requireOwner(ctx, env.OWNER_EMAIL ?? ""); } catch { return new Response("unauthorized", { status: 401, headers: base }); }

  if (request.method === "GET") {
    if (route === "/admin/styles.css") {
      return new Response(adminStyles, { headers: { ...base, "content-type": "text/css; charset=utf-8" } });
    }
    if (route === "/admin/api/status") {
      const result = await stateRequest(state, { op: "public-status" });
      return new Response(result.body, { status: result.status, headers: { ...base, "content-type": "application/json" } });
    }
    const statusResponse = await stateRequest(state, { op: "public-status" });
    if (!statusResponse.ok) return new Response("STATE_UNAVAILABLE", { status: 503, headers: base });
    const status = await statusResponse.json() as PublicStatus;
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const csrf = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrf)))).map(value => value.toString(16).padStart(2, "0")).join("");
    const stored = await stateRequest(state, { op: "csrf", digest, expires: Date.now() + 600_000 });
    if (!stored.ok) return new Response("STATE_UNAVAILABLE", { status: 503, headers: base });
    return new Response(adminHtml(status, csrf, principal), {
      headers: {
        ...base,
        "content-type": "text/html; charset=utf-8",
        "set-cookie": `admin_csrf=${csrf}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=600`,
      },
    });
  }

  if (request.method !== "POST") return new Response("method not allowed", { status: 405, headers: base });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  let sameOrigin = origin === url.origin;
  if (!origin && referer) {
    try { sameOrigin = new URL(referer).origin === url.origin; } catch { sameOrigin = false; }
  }
  if (!sameOrigin) return new Response("forbidden", { status: 403, headers: base });
  const form = await request.formData();
  const csrf = String(form.get("csrf") ?? "");
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)admin_csrf=([^;]+)/);
  if (!match || match[1] !== csrf) return new Response("forbidden", { status: 403, headers: base });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csrf)))).map(value => value.toString(16).padStart(2, "0")).join("");
  const checked = await stateRequest(state, { op: "csrf-check", digest });
  let csrfOk = false;
  if (checked.ok) {
    const checkedBody: unknown = await checked.json();
    csrfOk = !!checkedBody && typeof checkedBody === "object" && "ok" in checkedBody && checkedBody.ok === true;
  }
  if (!csrfOk) return new Response("forbidden", { status: 403, headers: base });

  const action = route === "/admin/api/login/start" ? "start-login"
    : route === "/admin/api/login/verify" ? "verify-code"
      : route === "/admin/api/login/cancel" ? "cancel-login"
        : String(form.get("action") ?? "");

  if (action === "disconnect") {
    const response = await stateRequest(state, { op: "disconnect" });
    return response.ok ? redirectAdmin(request) : new Response("STATE_UNAVAILABLE", { status: 503, headers: base });
  }

  if (action === "cancel-login") {
    try {
      const lease = await acquire(state);
      const response = await stateRequest(state, { op: "pending-clear", ...lease });
      if (!response.ok) throw new AdminError("The login request could not be cancelled.", 503);
      return redirectAdmin(request);
    } catch (error) {
      return errorResponse(error);
    }
  }

  if (action === "start-login") {
    let lease: Lease | null = null;
    try {
      lease = await acquire(state, "login-start-acquire");
      const attempt = await startEmailLogin(String(form.get("email") ?? ""), providerFetch);
      await savePending(state, lease, attempt, true);
      lease = null;
      return redirectAdmin(request);
    } catch (error) {
      if (lease) {
        const cooldown = error instanceof ProviderAuthError && (error.code === "AUTH_EMAIL_SEND_FAILED" || error.code === "AUTH_UNAVAILABLE");
        await release(state, lease, cooldown ? "login-cooldown" : "release");
      }
      return errorResponse(error);
    }
  }

  if (action === "verify-code") {
    let lease: Lease | null = null;
    try {
      lease = await acquire(state);
      const attempt = await loadPending(state, lease);
      if (attempt.verifyAttempts >= maxVerificationAttempts) {
        await stateRequest(state, { op: "pending-clear", ...lease });
        lease = null;
        throw new AdminError("Too many codes were rejected. Start login again.", 429);
      }
      const code = String(form.get("code") ?? "");
      const result = attempt.stage === "email"
        ? await verifyEmailCode(attempt, code, providerFetch)
        : await verifyAuthenticatorCode(attempt, code, providerFetch);
      if (result.kind === "totp") {
        await savePending(state, lease, result.attempt);
      } else {
        await saveSession(state, lease, result.cookies);
      }
      lease = null;
      return redirectAdmin(request);
    } catch (error) {
      if (lease) {
        const invalid = error instanceof ProviderAuthError && (error.code === "AUTH_OTP_INVALID" || error.code === "AUTH_TOTP_INVALID");
        if (invalid) {
          try {
            const attempt = await loadPending(state, lease);
            const next = { ...attempt, verifyAttempts: attempt.verifyAttempts + 1 };
            if (next.verifyAttempts >= maxVerificationAttempts) await stateRequest(state, { op: "pending-clear", ...lease });
            else await savePending(state, lease, next);
            lease = null;
          } catch { /* release below */ }
        }
        if (lease) await release(state, lease);
      }
      return errorResponse(error);
    }
  }

  return new Response("bad request", { status: 400, headers: base });
}
