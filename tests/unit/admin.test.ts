import { expect, it } from "vitest";
import { admin } from "../../src/admin";
import { OwnerState } from "../../src/owner-state";

const env = { OWNER_EMAIL: "owner@example.com" };
const context = { access: { getIdentity: async () => ({ email: "owner@example.com" }) } };

function fixture() {
  let record: unknown;
  const storage = {
    async get() { return record; },
    async put(_key: string, value: unknown) { record = structuredClone(value); },
  };
  const owner = new OwnerState({ storage } as never);
  const stub = {
    fetch: (request: Request) => request.clone().json().then((body: unknown) => {
      if (body && typeof body === "object" && "op" in body && body.op === "csrf-check") return Response.json({ ok: true });
      return owner.fetch(request);
    }),
  };
  return { owner, stub: stub as never, get: () => record };
}

function post(action: string, fields: Record<string, string> = {}, headers: HeadersInit = { origin: "https://example.test" }): Request {
  return new Request("https://example.test/admin", {
    method: "POST",
    headers: { ...headers, cookie: "admin_csrf=csrf" },
    body: new URLSearchParams({ action, csrf: "csrf", ...fields }),
  });
}

function providerSequence(responses: Response[]): typeof fetch {
  return (async () => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected provider request");
    return response;
  }) as typeof fetch;
}

it("renders semantic, accessible setup markup", async () => {
  const f = fixture();
  const response = await admin(new Request("https://example.test/admin"), env, f.stub, context);
  const html = await response.text();
  expect(html).toContain('<main><section class="card" aria-labelledby="page-title">');
  expect(html).toContain('role="status" aria-live="polite" aria-atomic="true"');
  expect(html).toContain('<link rel="stylesheet" href="/admin/styles.css">');
  expect(html).toContain('for="provider-email"');
  expect(html).toContain('<p class="section-label">Step 1 of 2</p>');
  expect(html).not.toContain("Provider connection");
  expect(html).not.toContain("Cloudflare encrypts the saved session at rest.");
  expect(html).not.toContain("Cookie header");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});

it("serves the protected stylesheet as CSS", async () => {
  const f = fixture();
  const response = await admin(new Request("https://example.test/admin/styles.css"), env, f.stub, context, "/admin/styles.css");
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/css");
  expect(await response.text()).toContain(".status-panel");
});

it("shows only the disconnect action for a connected session", async () => {
  const state = {
    async fetch(request: Request) {
      const body = await request.json() as { op: string };
      if (body.op === "public-status") return Response.json({ active: true, pending: false, pendingStage: null });
      return Response.json({ ok: true });
    },
  };
  const response = await admin(new Request("https://example.test/admin"), env, state as never, context);
  const html = await response.text();
  expect(html).toContain("Connected");
  expect(html).toContain('<form class="disconnect-form"');
  expect(html).toContain("Disconnect Perplexity");
  expect(html).not.toContain("Reconnect Perplexity");
  expect(html).not.toContain('id="provider-email"');
  expect(html).not.toContain('<section class="panel"');
});
it("renders a styled recovery page for provider errors", async () => {
  const f = fixture();
  const response = await admin(post("start-login", { email: "perplexity@example.com" }), env, f.stub, context, "/admin", async () => new Response("", { status: 500 }));
  const html = await response.text();
  expect(response.status).toBe(400);
  expect(html).toContain('aria-labelledby="error-title"');
  expect(html).toContain("Your session stays inside the protected Worker.");
  expect(html).toContain("Return to setup");
});

it("stores a pending login after Perplexity sends the email code", async () => {
  const f = fixture();
  const providerFetch = providerSequence([
    Response.json({ csrfToken: "csrf-token" }),
    Response.json({ ok: true }),
  ]);
  const response = await admin(post("start-login", { email: "perplexity@example.com" }), env, f.stub, context, "/admin", providerFetch);
  const record = f.get() as { active: unknown; pending: unknown; pendingStage: string };
  expect(response.status).toBe(303);
  expect(record.active).toBeNull();
  expect(record.pending).not.toBeNull();
  expect(record.pendingStage).toBe("email");
});

it("commits the session only after the email code succeeds", async () => {
  const f = fixture();
  const providerFetch = providerSequence([
    Response.json({ csrfToken: "csrf-token" }),
    Response.json({ ok: true }),
    Response.json({ status: "success", token: "session-token" }),
  ]);
  expect((await admin(post("start-login", { email: "perplexity@example.com" }), env, f.stub, context, "/admin", providerFetch)).status).toBe(303);
  expect((await admin(post("verify-code", { code: "123456" }), env, f.stub, context, "/admin", providerFetch)).status).toBe(303);
  const record = f.get() as { active: unknown; pending: unknown; pendingStage: string | null };
  expect(record.active).not.toBeNull();
  expect(record.pending).toBeNull();
  expect(record.pendingStage).toBeNull();
});

it("rejects a POST without a matching CSRF cookie", async () => {
  const f = fixture();
  const request = new Request("https://example.test/admin", {
    method: "POST",
    headers: { origin: "https://example.test" },
    body: new URLSearchParams({ action: "disconnect", csrf: "csrf" }),
  });
  expect((await admin(request, env, f.stub, context)).status).toBe(403);
});

it("accepts the same-origin Referer fallback used by native forms", async () => {
  const f = fixture();
  const response = await admin(post("disconnect", {}, { referer: "https://example.test/admin" }), env, f.stub, context);
  expect(response.status).toBe(303);
});

it("rejects a cross-origin Referer", async () => {
  const f = fixture();
  const response = await admin(post("disconnect", {}, { referer: "https://evil.example/admin" }), env, f.stub, context);
  expect(response.status).toBe(403);
});

it("escapes persisted status in admin HTML", async () => {
  const stub = {
    async fetch(request: Request) {
      const body = await request.json() as { op: string };
      if (body.op === "public-status") return Response.json({ active: false, pending: false, pendingStage: null, lastTest: { status: "<bad>", timestamp: 0 } });
      return Response.json({ ok: true });
    },
  };
  const response = await admin(new Request("https://example.test/admin"), env, stub as never, context);
  const html = await response.text();
  expect(html).toContain("&lt;bad&gt;");
  expect(html).not.toContain("<bad>");
});
