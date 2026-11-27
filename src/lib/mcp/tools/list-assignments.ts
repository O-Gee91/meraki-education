import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fetchAll } from "@/lib/query";
import { fail, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_assignments",
  title: "List assignments",
  description: "List assignments for a class the signed-in user can see. Use list_classes for ids.",
  inputSchema: {
    class_id: z.string().uuid().describe("Class id from list_classes."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ class_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    try {
      const assignments = await fetchAll((from, to) =>
        supabase
          .from("assignments")
          .select("id, title, category, points_possible, due_date, description")
          .eq("class_id", class_id)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("id")
          .range(from, to),
      );
      return ok({ assignments });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not list assignments.");
    }
  },
});
