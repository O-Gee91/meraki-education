import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), link: vi.fn(), send: vi.fn(), claim: vi.fn(), user: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { inputValidator: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  rpc: mocks.claim,
  from: () => {
    const query = { select: () => query, ilike: () => query, maybeSingle: mocks.lookup };
    return query;
  },
  auth: { admin: { generateLink: mocks.link, getUserById: mocks.user } },
} }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: mocks.send }));
import { requestPasswordReset } from "./password-reset.functions";
const run = requestPasswordReset as unknown as (input: { data: { email: string; origin: string } }) => Promise<{ ok: boolean }>;
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({ sent: true }); mocks.claim.mockResolvedValue({ data: true, error: null }); mocks.lookup.mockResolvedValue({ data: null }); });
describe("recovery endpoint", () => {
  it("rejects an external origin before reading accounts or issuing links", async () => {
    expect(await run({ data: { email: "student@example.invalid", origin: "https://attacker.example" } })).toEqual({ ok: true });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("suppresses repeated requests before looking up an account", async () => {
    mocks.claim.mockResolvedValue({ data: false, error: null });
    expect(await run({ data: { email: "student@example.invalid", origin: "https://meraki-education.app" } })).toEqual({ ok: true });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.claim.mock.calls[0]?.[1]?.['_key_hash']).toMatch(/^[a-f0-9]{64}$/);
  });
  it("fails closed if the durable quota is unavailable", async () => {
    mocks.claim.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    await run({ data: { email: "student@example.invalid", origin: "https://meraki-education.app" } });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("still delivers one allowed recovery email with an idempotency key", async () => {
    mocks.lookup.mockResolvedValue({ data: { id: "u1", email: "student@example.invalid", full_name: "Student", username: "student" } });
    mocks.user.mockResolvedValue({ data: { user: { email: "account@example.invalid" } }, error: null });
    mocks.link.mockResolvedValue({ data: { properties: { action_link: "https://meraki-education.app/reset-password" } }, error: null });
    await run({ data: { email: "student@example.invalid", origin: "https://meraki-education.app" } });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[2]?.idempotencyKey).toMatch(/^recovery-/);
  });
  it("returns the same neutral response for a nonexistent account on the legitimate site", async () => {
    expect(await run({ data: { email: "student@example.invalid", origin: "https://meraki-education.app" } })).toEqual({ ok: true });
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});