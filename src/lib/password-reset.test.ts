import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), link: vi.fn(), send: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = { inputValidator: () => builder, handler: (handler: unknown) => handler };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: () => {
    const query = { select: () => query, ilike: () => query, maybeSingle: mocks.lookup };
    return query;
  },
  auth: { admin: { generateLink: mocks.link } },
} }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: mocks.send }));
import { requestPasswordReset } from "./password-reset.functions";
const run = requestPasswordReset as unknown as (input: { data: { email: string; origin: string } }) => Promise<{ ok: boolean }>;
beforeEach(() => { vi.clearAllMocks(); mocks.lookup.mockResolvedValue({ data: null }); });
describe("recovery endpoint", () => {
  it("rejects an external origin before reading accounts or issuing links", async () => {
    expect(await run({ data: { email: "student@example.invalid", origin: "https://attacker.example" } })).toEqual({ ok: true });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("returns the same neutral response for a nonexistent account on the legitimate site", async () => {
    expect(await run({ data: { email: "student@example.invalid", origin: "https://meraki-education.app" } })).toEqual({ ok: true });
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});