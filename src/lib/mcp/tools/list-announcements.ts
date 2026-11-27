import { defineTool } from "@lovable.dev/mcp-js";
import { fetchAll } from "@/lib/query";
import { fail, ok, supabaseForUser, unauthenticated } from "../supabase";

const RECENT_ANNOUNCEMENTS = 50;

export default defineTool({
  name: "list_announcements",
  title: "List announcements",
  description: "List the most recent school and class announcements visible to the signed-in user.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    try {
      const announcements = await fetchAll((from, to) => {
        if (from >= RECENT_ANNOUNCEMENTS) return Promise.resolve({ data: [], error: null });
        return supabase
          .from("announcements")
          .select("id, title, body, audience, class_id, created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, Math.min(to, RECENT_ANNOUNCEMENTS - 1));
      });
      return ok({ announcements });
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Could not list announcements.");
    }
  },
});
