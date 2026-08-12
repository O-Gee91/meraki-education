import { defineTool } from "@lovable.dev/mcp-js";
import { fail, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_announcements",
  title: "List announcements",
  description: "List the most recent school and class announcements visible to the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("announcements")
      .select("id, title, body, audience, class_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return fail(error.message);
    return ok({ announcements: data ?? [] });
  },
});
