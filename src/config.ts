export type Env = { OWNER_EMAIL?: string };
export class SetupError extends Error { constructor(message: string) { super(message); this.name = "SETUP_REQUIRED"; } }
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function loadConfig(env: Env, deployment = "default") {
  const owner = env.OWNER_EMAIL?.trim().toLowerCase();
  if (!owner || !email.test(owner)) throw new SetupError("OWNER_EMAIL is required and must be valid");
  return { ownerEmail: owner, deployment };
}
