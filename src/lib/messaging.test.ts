import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ sent: true }),
  lookup: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/email-templates/send-email", () => ({ sendTemplateEmail: mocks.send }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { auth: { admin: { getUserById: mocks.lookup } } },
}));

import { notifyMessageRecipient } from "./messaging.functions";

const run = notifyMessageRecipient as unknown as (input: unknown) => Promise<{ sent: boolean }>;

function notify() {
  return run({
    data: { message_id: "msg-1" },
    context: {
      userId: "sender-1",
      supabase: {
        from: (table: string) => {
          const data = table === "messages"
            ? { id: "msg-1", subject: "Hello", body: "A note", sender_id: "sender-1", recipient_id: "recipient-1" }
            : [
                { id: "sender-1", full_name: "Teacher", email: "unverified-profile@example.com" },
                { id: "recipient-1", full_name: "Guardian", email: "unverified-profile@example.com" },
              ];
          const query = {
            select: () => query,
            eq: () => query,
            in: () => query,
            maybeSingle: async () => ({ data, error: null }),
            then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
              Promise.resolve({ data, error: null }).then(resolve),
          };
          return query;
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockImplementation(async (id: string) => ({
    data: {
      user: {
        id,
        email: "verified-guardian@example.com",
        email_confirmed_at: "2026-11-25T06:00:00Z",
      },
    },
    error: null,
  }));
});

describe("message notifications", () => {
  it("sends only to the confirmed Auth email", async () => {
    await expect(notify()).resolves.toEqual({ sent: true });
    expect(mocks.send.mock.calls.map((call) => call[1])).toEqual(["verified-guardian@example.com"]);
  });

  it("does not fall back to an unverified profile email", async () => {
    mocks.lookup.mockResolvedValue({
      data: { user: { id: "recipient-1", email: "verified-guardian@example.com", email_confirmed_at: null } },
      error: null,
    });
    await expect(notify()).resolves.toEqual({ sent: false });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
