import { z } from "zod";

const pendingStageSchema = z.enum(["email", "totp"]);
const recordStateSchema = z.object({
  v: z.literal(2),
  active: z.string().min(1).nullable(),
  pending: z.record(z.string(), z.unknown()).nullable(),
  pendingStage: pendingStageSchema.nullable(),
  generation: z.number().int().nonnegative(),
  leaseToken: z.string().min(1).nullable(),
  leaseUntil: z.number().nonnegative(),
  cooldownUntil: z.number().nonnegative(),
  attempts: z.number().int().nonnegative(),
  attemptWindowStartedAt: z.number().nonnegative(),
  csrf: z.object({ digest: z.string().min(1), expires: z.number().nonnegative() }).optional(),
  lastTest: z.object({ status: z.string(), timestamp: z.number().nonnegative(), code: z.string().optional() }).optional(),
}).strict();
const legacyStateSchema = z.object({
  v: z.literal(1),
  generation: z.number().int().nonnegative().optional(),
}).passthrough();
const operationSchema = z.object({
  op: z.string().optional(),
  value: z.unknown().optional(),
  token: z.string().optional(),
  generation: z.number().int().nonnegative().optional(),
  leaseMs: z.number().optional(),
  digest: z.string().optional(),
  expires: z.number().optional(),
  status: z.string().optional(),
  code: z.string().optional(),
  stage: pendingStageSchema.optional(),
  sent: z.boolean().optional(),
}).passthrough();

type RecordState = z.infer<typeof recordStateSchema>;
const KEY = "state";
const loginCooldownMs = 60_000;
const loginWindowMs = 60 * 60_000;
const maxLoginSendsPerWindow = 3;

function empty(generation = 0): RecordState {
  return {
    v: 2,
    active: null,
    pending: null,
    pendingStage: null,
    generation,
    leaseToken: null,
    leaseUntil: 0,
    cooldownUntil: 0,
    attempts: 0,
    attemptWindowStartedAt: 0,
  };
}

function fenced(state: RecordState, token?: string, generation?: number, now = Date.now()): boolean {
  return !!token && state.leaseToken === token && state.generation === generation && state.leaseUntil > now;
}

function acquire(state: RecordState, leaseMs: number, now: number): { token: string; generation: number } {
  state.generation++;
  state.leaseToken = crypto.randomUUID();
  state.leaseUntil = now + Math.min(Math.max(leaseMs, 1000), 60_000);
  return { token: state.leaseToken, generation: state.generation };
}

function release(state: RecordState): void {
  state.leaseToken = null;
  state.leaseUntil = 0;
}

function recordLoginSend(state: RecordState, now: number): void {
  if (!state.attemptWindowStartedAt || now - state.attemptWindowStartedAt >= loginWindowMs) {
    state.attemptWindowStartedAt = now;
    state.attempts = 0;
  }
  state.attempts++;
  state.cooldownUntil = now + loginCooldownMs;
}

export class OwnerState {
  constructor(private readonly state: DurableObjectState) {}

  private async load(): Promise<RecordState> {
    const stored: unknown = await this.state.storage.get(KEY);
    if (stored === undefined) return empty();
    const current = recordStateSchema.safeParse(stored);
    if (current.success) return current.data;
    const legacy = legacyStateSchema.safeParse(stored);
    if (!legacy.success) throw new Error("invalid state");
    const migrated = empty((legacy.data.generation ?? 0) + 1);
    await this.state.storage.put(KEY, migrated);
    return migrated;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      let current: RecordState;
      try { current = await this.load(); } catch { return new Response("STATE_UNAVAILABLE", { status: 503 }); }
      return Response.json({ active: !!current.active, pending: !!current.pending, pendingStage: current.pendingStage, generation: current.generation });
    }
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

    let body: z.infer<typeof operationSchema>;
    try {
      const parsed: unknown = await request.json();
      const result = operationSchema.safeParse(parsed);
      if (!result.success) return new Response("bad request", { status: 400 });
      body = result.data;
    } catch {
      return new Response("bad request", { status: 400 });
    }

    let current: RecordState;
    try { current = await this.load(); } catch { return new Response("STATE_UNAVAILABLE", { status: 503 }); }
    const now = Date.now();

    try {
      if (body.op === "status") {
        if ((body.token || body.generation !== undefined) && !fenced(current, body.token, body.generation, now)) return Response.json({ error: "STALE_LEASE" }, { status: 409 });
        return Response.json({
          active: current.active,
          pending: current.pending,
          pendingStage: current.pendingStage,
          generation: current.generation,
          leaseUntil: current.leaseUntil,
          cooldownUntil: current.cooldownUntil,
          attempts: current.attempts,
          lastTest: current.lastTest ?? null,
        });
      }
      if (body.op === "public-status") {
        return Response.json({
          active: !!current.active,
          pending: !!current.pending,
          pendingStage: current.pendingStage,
          generation: current.generation,
          leaseUntil: current.leaseUntil,
          cooldownUntil: current.cooldownUntil,
          attempts: current.attempts,
          lastTest: current.lastTest ?? null,
        });
      }
      if (body.op === "csrf") {
        if (!body.digest || !Number.isFinite(body.expires) || Number(body.expires) <= now) return Response.json({ error: "INVALID_CSRF" }, { status: 400 });
        current.csrf = { digest: body.digest, expires: Number(body.expires) };
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (body.op === "csrf-check") return Response.json({ ok: !!current.csrf && current.csrf.expires > now && current.csrf.digest === body.digest });
      if (body.op === "acquire") {
        if (current.leaseUntil > now) return Response.json({ error: "BUSY" }, { status: 409 });
        const lease = acquire(current, body.leaseMs ?? 15_000, now);
        await this.state.storage.put(KEY, current);
        return Response.json(lease);
      }
      if (body.op === "login-start-acquire") {
        if (current.leaseUntil > now) return Response.json({ error: "BUSY" }, { status: 409 });
        if (current.cooldownUntil > now) return Response.json({ error: "COOLDOWN", retryAfter: Math.ceil((current.cooldownUntil - now) / 1000) }, { status: 429 });
        if (current.attemptWindowStartedAt && now - current.attemptWindowStartedAt < loginWindowMs && current.attempts >= maxLoginSendsPerWindow) {
          return Response.json({ error: "RATE_LIMITED", retryAfter: Math.ceil((current.attemptWindowStartedAt + loginWindowMs - now) / 1000) }, { status: 429 });
        }
        const lease = acquire(current, body.leaseMs ?? 20_000, now);
        await this.state.storage.put(KEY, current);
        return Response.json(lease);
      }
      if (body.op === "disconnect") {
        current.active = null;
        current.pending = null;
        current.pendingStage = null;
        release(current);
        current.generation++;
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (!fenced(current, body.token, body.generation, now)) return Response.json({ error: "STALE_LEASE" }, { status: 409 });
      if (body.op === "release") {
        release(current);
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (body.op === "login-cooldown") {
        recordLoginSend(current, now);
        release(current);
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (body.op === "pending-save") {
        const pending = z.record(z.string(), z.unknown()).safeParse(body.value);
        if ((body.stage !== "email" && body.stage !== "totp") || !pending.success) return Response.json({ error: "INVALID_PENDING" }, { status: 400 });
        current.pending = pending.data;
        current.pendingStage = body.stage;
        if (body.sent) recordLoginSend(current, now);
        release(current);
        current.generation++;
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (body.op === "pending-clear") {
        current.pending = null;
        current.pendingStage = null;
        release(current);
        current.generation++;
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (body.op === "test-result") {
        current.lastTest = { status: body.status === "ok" ? "ok" : "error", timestamp: now, ...(body.code ? { code: body.code } : {}) };
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      if (body.op === "save") {
        if (typeof body.value !== "string" || !body.value) return Response.json({ error: "INVALID_SESSION" }, { status: 400 });
        current.active = body.value;
        current.pending = null;
        current.pendingStage = null;
        release(current);
        current.generation++;
        await this.state.storage.put(KEY, current);
        return Response.json({ ok: true });
      }
      return Response.json({ error: "invalid operation" }, { status: 400 });
    } catch {
      return new Response("STATE_UNAVAILABLE", { status: 503 });
    }
  }
}
