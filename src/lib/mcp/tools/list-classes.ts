import { defineTool } from "@lovable.dev/mcp-js";
import { fail, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_classes",
  title: "List classes",
  description:
    "List the classes visible to the signed-in user (their own classes as a student or guardian, or all classes for staff).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("classes")
      .select("id, name, subject, period, room, term")
      .order("name");
    if (error) return fail(error.message);
    return ok({ classes: data ?? [] });
  },
});
