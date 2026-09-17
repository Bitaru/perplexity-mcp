import { expect, it } from "vitest";
import { startEmailLogin, verifyAuthenticatorCode, verifyEmailCode } from "../../src/perplexity/auth";

function jsonResponse(body: Record<string, unknown>, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ "content-type": "application/json" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function sequence(responses: Response[]): { fetcher: typeof fetch; requests: Request[] } {
  const requests: Request[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push(new Request(input, init));
    const response = responses.shift();
    if (!response) throw new Error("unexpected provider request");
    return response;
  };
  return { fetcher: fetcher as typeof fetch, requests };
}

it("acquires a Perplexity session from an email code without exposing the code", async () => {
  const fixture = sequence([
    jsonResponse({ csrfToken: "csrf-token" }, 200, ["__Host-next-auth.csrf-token=csrf-cookie; Path=/; Secure; HttpOnly"]),
    jsonResponse({ ok: true }, 200, ["login-state=sent; Path=/api/auth; Secure"]),
    jsonResponse({ status: "success", token: "session-token" }),
  ]);

  const attempt = await startEmailLogin(" Owner@Example.com ", fixture.fetcher, 1_000);
  const result = await verifyEmailCode(attempt, "123456", fixture.fetcher, 2_000);

  expect(attempt.email).toBe("owner@example.com");
  expect(result).toEqual({ kind: "authenticated", cookies: expect.stringContaining("__Secure-next-auth.session-token=session-token") });
  expect(fixture.requests.map(request => new URL(request.url).pathname)).toEqual(["/api/auth/csrf", "/api/auth/signin-email", "/api/auth/signin-otp"]);
  expect(fixture.requests[1].headers.get("cookie")).toContain("__Host-next-auth.csrf-token=csrf-cookie");
  expect(await fixture.requests[2].clone().json()).toEqual({ email: "owner@example.com", otp: "123456", csrfToken: "csrf-token" });
});

it("continues through a required authenticator challenge", async () => {
  const fixture = sequence([
    jsonResponse({ csrfToken: "csrf-token" }),
    jsonResponse({ ok: true }),
    jsonResponse({ status: "totp_challenge_required", challenge_token: "challenge-token" }),
    jsonResponse({ status: "success", token: "session-token" }),
  ]);

  const emailAttempt = await startEmailLogin("owner@example.com", fixture.fetcher, 1_000);
  const challenge = await verifyEmailCode(emailAttempt, "111111", fixture.fetcher, 2_000);
  expect(challenge.kind).toBe("totp");
  if (challenge.kind !== "totp") throw new Error("expected authenticator challenge");

  const result = await verifyAuthenticatorCode(challenge.attempt, "222222", fixture.fetcher, 3_000);
  expect(result.kind).toBe("authenticated");
  expect(await fixture.requests[3].clone().json()).toEqual({ token: "challenge-token", code: "222222" });
});

it("does not follow provider authentication redirects", async () => {
  const fixture = sequence([new Response(null, { status: 302, headers: { location: "https://evil.example/" } })]);
  await expect(startEmailLogin("owner@example.com", fixture.fetcher)).rejects.toMatchObject({ code: "AUTH_PROTOCOL_ERROR" });
  expect(fixture.requests[0].redirect).toBe("manual");
});
