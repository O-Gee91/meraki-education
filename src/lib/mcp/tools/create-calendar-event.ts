import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, ok, supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_calendar_event",
  title: "Create calendar event",
  description:
    "Post a school calendar event. Only staff accounts are permitted; other accounts get a permission error.",
  inputSchema: {
    title: z.string().trim().min(2).describe("Event title."),
    event_date: z.string().describe("Event date as YYYY-MM-DD."),
    description: z.string().trim().optional(),
    location: z.string().trim().optional(),
    start_time: z.string().describe("Optional start time as HH:MM.").optional(),
    end_time: z.string().describe("Optional end time as HH:MM.").optional(),
    category: z
      .enum(["general", "exam", "holiday", "event", "deadline"])
      .describe("Event category.")
      .optional(),
    audience: z
      .enum(["everyone", "students", "parents", "teachers"])
      .describe("Who can see the event.")
      .optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        title: input.title,
        event_date: input.event_date,
        description: input.description ?? null,
        location: input.location ?? null,
        start_time: input.start_time ?? null,
        end_time: input.end_time ?? null,
        category: input.category ?? "general",
        audience: input.audience ?? "everyone",
        created_by: ctx.getUserId(),
      })
      .select("id, title, event_date, category, audience");
    if (error) return fail(error.message);
    return ok({ event: data?.[0] });
  },
});
