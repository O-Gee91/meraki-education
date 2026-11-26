import { beforeEach, describe, expect, it, vi } from "vitest";
import { linkAccountInput, provisionAccountsInput, resetAccountInput } from "./account-input";
import { linkAccountToStudent } from "./unlinked.server";
import { provisionRosterAccounts } from "./roster.server";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as { table: string; values: unknown; filters: [string, unknown][] }[],
  queries: [] as { table: string; filters: [string, unknown][] }[],
  createUser: vi.fn(), updateUser: vi.fn(),
}));

function from(table: string) {
  const filters: [string, unknown][] = [];
  let values: unknown;
  const matching = () => (state.rows[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
  const result = (single = false) => {
    state.queries.push({ table, filters: [...filters] });
    const rows = matching();
    if (values) state.writes.push({ table, values, filters: [...filters] });
    return { data: single ? rows[0] ?? null : rows, error: null };
  };
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    is: (key: string, value: unknown) => { filters.push([key, value]); return query; },
    neq: () => query,
    limit: () => query,
    update: (patch: unknown) => { values = patch; return query; },
    insert: (patch: unknown) => { values = patch; return query; },
    maybeSingle: async () => result(true),
    single: async () => result(true),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return query;
}

const admin = { from, auth: { admin: {
  createUser: state.createUser, updateUserById: state.updateUser,
  getUserById: async () => ({ data: { user: { id: ACCOUNT, last_sign_in_at: "2026-11-26" } }, error: null }),
} } };
type Admin = Parameters<typeof provisionRosterAccounts>[0];
const client = admin as unknown as Admin;

beforeEach(() => {
  state.rows = {
    students: [{ id: STUDENT, user_id: null, guardian_user_id: null }],
    user_roles: [{ user_id: ACCOUNT, role: "student" }],
    profiles: [{ id: ACCOUNT, full_name: "Test Student", email: "test@example.com", username: null }],
    staff_access_requests: [],
  };
  state.writes = []; state.queries = [];
  state.createUser.mockReset().mockResolvedValue({ data: null, error: { message: "Email already registered" } });
  state.updateUser.mockReset().mockResolvedValue({ error: null });
});

describe("selected account security protections", () => {
  it("rejects reset filter syntax before a query can execute", () => {
    expect(() => resetAccountInput.parse({ user_id: `${ACCOUNT},id.eq.${STUDENT}` })).toThrow();
    expect(resetAccountInput.parse({ user_id: ACCOUNT }).user_id).toBe(ACCOUNT);
  });
  it("rejects invalid roles and identifiers at linking and provisioning boundaries", () => {
    expect(() => linkAccountInput.parse({ user_id: ACCOUNT, role: "admin" })).toThrow();
    expect(() => provisionAccountsInput.parse({ entries: [{ student_id: "arbitrary", first_name: "Test", last_name: "Student" }] })).toThrow();
  });
  it("refuses an already-linked account even for another empty student", async () => {
    state.rows["students"]?.push({ id: OTHER, user_id: ACCOUNT, guardian_user_id: null });
    await expect(linkAccountToStudent(client, { user_id: ACCOUNT, role: "student", student_id: STUDENT })).rejects.toThrow("already linked");
    expect(state.writes).toHaveLength(0);
  });
  it("refuses staff accounts even with a stray student role", async () => {
    state.rows["user_roles"]?.push({ user_id: ACCOUNT, role: "teacher" });
    await expect(linkAccountToStudent(client, { user_id: ACCOUNT, role: "student", student_id: STUDENT })).rejects.toThrow("matching role");
    expect(state.writes).toHaveLength(0);
  });
  it("refuses a pending educator-access applicant", async () => {
    state.rows["staff_access_requests"] = [{ id: OTHER, user_id: ACCOUNT, status: "pending" }];
    await expect(linkAccountToStudent(client, { user_id: ACCOUNT, role: "student", student_id: STUDENT })).rejects.toThrow("matching role");
    expect(state.writes).toHaveLength(0);
  });
  it("does not replace an existing student account", async () => {
    state.rows["students"] = [{ id: STUDENT, user_id: OTHER, guardian_user_id: null }];
    await expect(linkAccountToStudent(client, { user_id: ACCOUNT, role: "student", student_id: STUDENT })).rejects.toThrow("already has an account");
    expect(state.writes[0]?.filters).toContainEqual(["user_id", null]);
  });
  it("allows the matching pending account into an empty student link", async () => {
    await expect(linkAccountToStudent(client, { user_id: ACCOUNT, role: "student", student_id: STUDENT })).resolves.toEqual({ student_id: STUDENT });
    expect(state.writes[0]?.values).toEqual({ user_id: ACCOUNT });
  });
  it("rejects a student account submitted as a guardian", async () => {
    await expect(linkAccountToStudent(client, { user_id: ACCOUNT, role: "parent", student_id: STUDENT })).rejects.toThrow("matching role");
    expect(state.writes).toHaveLength(0);
  });
  it("retains creation of a new username login without reusing an email match", async () => {
    state.createUser.mockResolvedValue({ data: { user: { id: ACCOUNT } }, error: null });
    const result = await provisionRosterAccounts(client, [{ student_id: STUDENT, first_name: "Test", last_name: "Student", student_username: "test.student", student_email: "test@example.com" }]);
    expect(result[0]?.status).toBe("created");
    expect(state.createUser).toHaveBeenCalledTimes(1);
    expect(state.writes.some((write) => write.table === "students" && JSON.stringify(write.values) === JSON.stringify({ user_id: ACCOUNT }))).toBe(true);
  });
  it("never attaches an existing account by an editable contact email", async () => {
    const result = await provisionRosterAccounts(client, [{ student_id: STUDENT, first_name: "Test", last_name: "Student", student_email: "test@example.com" }]);
    expect(result[0]?.status).toBe("failed");
    expect(state.writes).toHaveLength(0);
    expect(state.queries.some((query) => query.table === "profiles" && query.filters.some(([key]) => key === "email"))).toBe(false);
  });
  it("rejects supplied account identifiers that differ from the stored link", async () => {
    const result = await provisionRosterAccounts(client, [{ student_id: STUDENT, first_name: "Test", last_name: "Student", student_user_id: OTHER, student_email: "test@example.com", reset_existing: true }]);
    expect(result[0]?.status).toBe("failed");
    expect(state.createUser).not.toHaveBeenCalled();
    expect(state.updateUser).not.toHaveBeenCalled();
    expect(state.writes).toHaveLength(0);
  });
  it("preserves password reissues for the account actually linked to the student", async () => {
    state.rows["students"] = [{ id: STUDENT, user_id: ACCOUNT, guardian_user_id: null }];
    const result = await provisionRosterAccounts(client, [{ student_id: STUDENT, first_name: "Test", last_name: "Student", student_user_id: ACCOUNT, reset_existing: true }]);
    expect(result[0]?.status).toBe("linked");
    expect(state.updateUser).toHaveBeenCalledWith(ACCOUNT, { password: expect.any(String) });
    expect(state.writes[0]?.filters).toContainEqual(["user_id", ACCOUNT]);
  });
  it("preserves password reissues for the linked guardian", async () => {
    state.rows["students"] = [{ id: STUDENT, user_id: null, guardian_user_id: ACCOUNT }];
    const result = await provisionRosterAccounts(client, [{ student_id: STUDENT, first_name: "Test", last_name: "Student", guardian_user_id: ACCOUNT, reset_existing: true }]);
    expect(result[0]?.status).toBe("linked");
    expect(state.updateUser).toHaveBeenCalledWith(ACCOUNT, { password: expect.any(String) });
    expect(state.writes[0]?.filters).toContainEqual(["guardian_user_id", ACCOUNT]);
  });
});