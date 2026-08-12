import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_calendar_events",
  title: "List calendar events",
  description:
    "List upcoming school calendar events the signed-in user is allowed to see, optionally from a start date.",
  inputSchema: {
    from_date: z
      .string()
      .describe("Optional ISO date (YYYY-MM-DD). Events on or after this date are returned.")
      .optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from_date }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("calendar_events")
      .select("id, title, description, event_date, start_time, end_time, location, category, audience")
      .order("event_date")
      .limit(100);
    if (from_date) query = query.gte("event_date", from_date);
    const { data, error } = await query;
    if (error) return fail(error.message);
    return ok({ events: data ?? [] });
  },
});
