import { defineTool } from "@lovable.dev/mcp-js";
import { fetchAll } from "@/lib/query";
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
    try {
      const classes = await fetchAll((from, to) =>
        supabase
          .from("classes")
          .select("id, name, subject, period, room, term")
          .order("name")
          .order("id")
          .range(from, to),
      );
      return ok({ classes });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not list classes.");
    }
  },
});
