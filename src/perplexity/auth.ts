import { cookieHeader, mergeCookie, parseSetCookie, type Cookie } from "./cookies";

const authBase = "https://www.perplexity.ai/api/auth";
const searchUrl = "https://www.perplexity.ai/rest/sse/perplexity_ask";
const apiVersion = "2.18";
const appUserAgent = "Perplexity/641 CFNetwork/1568 Darwin/25.2.0";
const loginLifetimeMs = 15 * 60 * 1000;
const maxJsonBytes = 64 * 1024;

export type LoginStage = "email" | "totp";
export type LoginAttempt = {
  v: 1;
  stage: LoginStage;
  email: string;
  cookies: Cookie[];
  createdAt: number;
  expiresAt: number;
  verifyAttempts: number;
  csrfToken?: string;
  challengeToken?: string;
};
export type LoginResult =
  | { kind: "authenticated"; cookies: string }
  | { kind: "totp"; attempt: LoginAttempt };
export type ProviderAuthCode =
  | "AUTH_EMAIL_INVALID"
  | "AUTH_CSRF_FAILED"
  | "AUTH_EMAIL_SEND_FAILED"
  | "AUTH_STATE_EXPIRED"
  | "AUTH_OTP_INVALID"
  | "AUTH_TOTP_INVALID"
  | "AUTH_SESSION_MISSING"
  | "AUTH_UNAVAILABLE"
  | "AUTH_PROTOCOL_ERROR";

export class ProviderAuthError extends Error {
  constructor(public readonly code: ProviderAuthCode, message: string) {
    super(message);
    this.name = code;
  }
}

function authHeaders(): HeadersInit {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "user-agent": appUserAgent,
    "x-app-apiversion": apiVersion,
  };
}

function validEmail(email: string): boolean {
  return email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validCode(code: string): boolean {
  const length = code.trim().length;
  return length > 0 && length <= 32;
}

function setCookieLines(headers: Headers): string[] {
  const extended = headers as Headers & {
    getSetCookie?: () => string[];
    getAll?: (name: string) => string[];
  };
  if (typeof extended.getSetCookie === "function") return extended.getSetCookie();
  if (typeof extended.getAll === "function") return extended.getAll("set-cookie");
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function rememberCookies(jar: Cookie[], response: Response, requestUrl: string): Cookie[] {
  let next = jar;
  for (const line of setCookieLines(response.headers)) {
    const parsed = parseSetCookie(line, requestUrl);
    if (parsed) next = mergeCookie(next, parsed);
  }
  return next;
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.text();
  if (body.length > maxJsonBytes) throw new ProviderAuthError("AUTH_PROTOCOL_ERROR", "Perplexity returned an oversized authentication response.");
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ProviderAuthError("AUTH_PROTOCOL_ERROR", "Perplexity returned an invalid authentication response.");
  }
}

async function authRequest(path: string, jar: Cookie[], init: RequestInit, fetcher: typeof fetch): Promise<{ response: Response; cookies: Cookie[] }> {
  const url = `${authBase}${path}`;
  const headers = new Headers(init.headers);
  const serialized = cookieHeader(jar, url);
  if (serialized) headers.set("cookie", serialized);
  let response: Response;
  try {
    response = await fetcher(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ProviderAuthError("AUTH_UNAVAILABLE", "Perplexity authentication is temporarily unavailable.");
  }
  const cookies = rememberCookies(jar, response, url);
  if (response.status >= 300 && response.status < 400) throw new ProviderAuthError("AUTH_PROTOCOL_ERROR", "Perplexity returned an unexpected authentication redirect.");
  return { response, cookies };
}

function requireAttempt(attempt: LoginAttempt, stage: LoginStage, now: number): void {
  if (attempt.v !== 1 || attempt.stage !== stage || attempt.expiresAt <= now || attempt.createdAt > now || !validEmail(attempt.email)) {
    throw new ProviderAuthError("AUTH_STATE_EXPIRED", "The Perplexity login request expired. Start again.");
  }
}

function authenticatedCookies(jar: Cookie[], token: unknown): string {
  let cookies = jar;
  const current = cookieHeader(cookies, searchUrl);
  if (!/(?:^|;\s*)(?:__Secure-next-auth\.session-token|next-auth\.session-token)=/.test(current) && typeof token === "string" && token) {
    cookies = mergeCookie(cookies, {
      name: "__Secure-next-auth.session-token",
      value: token,
      domain: "www.perplexity.ai",
      path: "/",
      hostOnly: true,
      secure: true,
    });
  }
  const serialized = cookieHeader(cookies, searchUrl);
  if (!/(?:^|;\s*)(?:__Secure-next-auth\.session-token|next-auth\.session-token)=/.test(serialized)) {
    throw new ProviderAuthError("AUTH_SESSION_MISSING", "Perplexity did not create a usable session.");
  }
  return serialized;
}

export async function startEmailLogin(emailInput: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<LoginAttempt> {
  const email = emailInput.trim().toLowerCase();
  if (!validEmail(email)) throw new ProviderAuthError("AUTH_EMAIL_INVALID", "Enter a valid Perplexity email address.");
  const csrfResult = await authRequest("/csrf", [], { method: "GET", headers: authHeaders() }, fetcher);
  if (!csrfResult.response.ok) throw new ProviderAuthError("AUTH_CSRF_FAILED", "Perplexity could not start authentication.");
  const csrf = await responseJson(csrfResult.response);
  if (typeof csrf.csrfToken !== "string" || !csrf.csrfToken) throw new ProviderAuthError("AUTH_CSRF_FAILED", "Perplexity did not return an authentication token.");
  const sendResult = await authRequest("/signin-email", csrfResult.cookies, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email, csrfToken: csrf.csrfToken }),
  }, fetcher);
  if (!sendResult.response.ok) throw new ProviderAuthError("AUTH_EMAIL_SEND_FAILED", "Perplexity could not send the login code.");
  return {
    v: 1,
    stage: "email",
    email,
    cookies: sendResult.cookies,
    csrfToken: csrf.csrfToken,
    createdAt: now,
    expiresAt: now + loginLifetimeMs,
    verifyAttempts: 0,
  };
}

export async function verifyEmailCode(attempt: LoginAttempt, code: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<LoginResult> {
  requireAttempt(attempt, "email", now);
  if (!validCode(code) || typeof attempt.csrfToken !== "string") throw new ProviderAuthError("AUTH_OTP_INVALID", "Enter the code sent by Perplexity.");
  const result = await authRequest("/signin-otp", attempt.cookies, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ email: attempt.email, otp: code.trim(), csrfToken: attempt.csrfToken }),
  }, fetcher);
  const body = await responseJson(result.response);
  if (!result.response.ok || body.error_code) throw new ProviderAuthError("AUTH_OTP_INVALID", "Perplexity rejected the email code.");
  if (body.status === "totp_challenge_required" && typeof body.challenge_token === "string") {
    return {
      kind: "totp",
      attempt: {
        ...attempt,
        stage: "totp",
        cookies: result.cookies,
        challengeToken: body.challenge_token,
        csrfToken: undefined,
      },
    };
  }
  return { kind: "authenticated", cookies: authenticatedCookies(result.cookies, body.token) };
}

export async function verifyAuthenticatorCode(attempt: LoginAttempt, code: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<LoginResult> {
  requireAttempt(attempt, "totp", now);
  if (!validCode(code) || typeof attempt.challengeToken !== "string") throw new ProviderAuthError("AUTH_TOTP_INVALID", "Enter the code from your authenticator app.");
  const result = await authRequest("/totp/challenge-verify", attempt.cookies, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ token: attempt.challengeToken, code: code.trim() }),
  }, fetcher);
  const body = await responseJson(result.response);
  if (!result.response.ok || body.error_code) throw new ProviderAuthError("AUTH_TOTP_INVALID", "Perplexity rejected the authenticator code.");
  return { kind: "authenticated", cookies: authenticatedCookies(result.cookies, body.token) };
}
