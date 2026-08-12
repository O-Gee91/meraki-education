import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listClasses from "./tools/list-classes";
import listAssignments from "./tools/list-assignments";
import listAnnouncements from "./tools/list-announcements";
import listCalendarEvents from "./tools/list-calendar-events";
import createCalendarEvent from "./tools/create-calendar-event";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// value that survives publish unchanged and Vite inlines it at build time.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "student-success-hub",
  title: "Student Success Hub",
  version: "0.1.0",
  instructions:
    "Tools for the Meraki Education school platform. Every call acts as the signed-in user, so results respect their role (staff, teacher, student or guardian). Use list_classes to discover class ids, list_assignments for coursework, list_announcements and list_calendar_events for school news and scheduling, and create_calendar_event (staff only) to post a new event.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listClasses,
    listAssignments,
    listAnnouncements,
    listCalendarEvents,
    createCalendarEvent,
  ],
});
