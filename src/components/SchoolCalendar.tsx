import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AUDIENCES, audienceLabel } from "@/lib/audience";
import { useAuth } from "@/hooks/useAuth";

const CATEGORIES = [
  { value: "event", label: "Event" },
  { value: "exam", label: "Exam / assessment" },
  { value: "deadline", label: "Deadline" },
  { value: "meeting", label: "Meeting" },
  { value: "holiday", label: "Holiday / no school" },
] as const;

type Audience = "everyone" | "students" | "parents" | "teachers";

const COLORS = [
  {
    value: "red",
    label: "Red — High alert",
    description: "Exams, assignment due dates, report cards",
    dot: "bg-destructive",
    chip: "bg-destructive/15 text-destructive",
    edge: "border-l-destructive",
  },
  {
    value: "amber",
    label: "Orange — Events",
    description: "Field trips, assemblies, dances, sports",
    dot: "bg-warning",
    chip: "bg-warning/20 text-warning-foreground",
    edge: "border-l-warning",
  },
  {
    value: "green",
    label: "Green — Normal day",
    description: "Regular instructional days, business as usual",
    dot: "bg-success",
    chip: "bg-success/15 text-success",
    edge: "border-l-success",
  },
  {
    value: "navy",
    label: "Blue — Admin / staff",
    description: "Staff meetings, PD days, holidays (closed)",
    dot: "bg-primary",
    chip: "bg-primary/15 text-primary",
    edge: "border-l-primary",
  },
] as const;

const DEFAULT_COLOR_BY_CATEGORY: Record<string, string> = {
  event: "amber",
  exam: "red",
  deadline: "red",
  meeting: "navy",
  holiday: "navy",
};

function colorOption(value: string) {
  return (
    COLORS.find((c) => c.value === value) ??
    COLORS.find((c) => c.value === "green")!
  );
}

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  category: string;
  audience: string;
  audiences: Audience[] | null;
  class_id: string | null;
  color: string;
};


const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h += 1) {
  for (const m of [0, 30]) {
    TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

function TimeSelect({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Select
      value={value || "none"}
      onValueChange={(v) => onChange(v === "none" ? "" : v)}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-60">
        <SelectItem value="none">{placeholder}</SelectItem>
        {TIME_OPTIONS.map((t) => (
          <SelectItem key={t} value={t}>
            {formatTime(t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function toKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function formatTime(value?: string | null) {
  if (!value) return null;
  const [h, m] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

export function SchoolCalendar() {
  const { isStaff, isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(toKey(today));
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const emptyForm = {
    title: "",
    description: "",
    category: "event",
    audiences: ["everyone"] as Audience[],
    color: "amber",
    start_time: "",
    end_time: "",
    location: "",
    event_date: "",
    class_id: "" as string,
  };
  const [form, setForm] = useState(emptyForm);
  const [colorFilter, setColorFilter] = useState<string[]>([]);

  // Students and families can collapse the calendar to save space.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("school-calendar-collapsed");
      if (stored) setIsCollapsed(stored === "true");
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("school-calendar-collapsed", String(isCollapsed));
    } catch {
      // ignore storage errors
    }
  }, [isCollapsed]);

  const { data: myClasses = [] } = useQuery({
    queryKey: ["calendar-scope-classes", user?.id],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // An admin posting as a teacher should default to their own class, not the school.
  useEffect(() => {
    if (editingId || isAdmin || !myClasses.length) return;
    setForm((prev) => (prev.class_id ? prev : { ...prev, class_id: myClasses[0]!.id }));
  }, [editingId, isAdmin, myClasses]);

  const monthStart = toKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const monthEnd = toKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

  const { data: allEvents = [] } = useQuery({
    queryKey: ["calendar-events", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select(
          "id, title, description, event_date, start_time, end_time, location, category, audience, audiences, color, class_id",
        )
        .gte("event_date", monthStart)
        .lte("event_date", monthEnd)
        .order("event_date")
        .order("start_time", { nullsFirst: true });
      if (error) throw error;
      return data as EventRow[];
    },
  });

  const events = useMemo(
    () =>
      colorFilter.length === 0
        ? allEvents
        : allEvents.filter((e) => colorFilter.includes(e.color)),
    [allEvents, colorFilter],
  );


  const byDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of events) {
      const list = map.get(e.event_date) ?? [];
      list.push(e);
      map.set(e.event_date, list);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = first.getDay();
    const out: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    return out;
  }, [cursor]);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Give the event a title");
      if (form.audiences.length === 0) throw new Error("Pick at least one audience");
      const audiences = form.audiences.includes("everyone")
        ? (["everyone"] as Audience[])
        : form.audiences;
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        audience: audiences[0]!,
        audiences,
        color: form.color,
        event_date: form.event_date || selectedDate,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim() || null,
        class_id: form.class_id || null,
      };
      if (editingId) {
        const { error } = await supabase
          .from("calendar_events")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("calendar_events")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
      return payload.event_date;
    },
    onSuccess: (eventDate) => {
      toast.success(editingId ? "Event updated" : "Posted to the school calendar");
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      setSelectedDate(eventDate);
      setCursor(new Date(`${eventDate}T00:00:00`));
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (e: EventRow) => {
    setEditingId(e.id);
    setShowForm(true);
    setForm({
      title: e.title,
      description: e.description ?? "",
      category: e.category,
      audiences: (e.audiences?.length ? e.audiences : [e.audience as Audience]) as Audience[],
      color: e.color,
      start_time: e.start_time?.slice(0, 5) ?? "",
      end_time: e.end_time?.slice(0, 5) ?? "",
      location: e.location ?? "",
      event_date: e.event_date,
      class_id: e.class_id ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setShowForm(false);
    setForm(emptyForm);
  };

  const toggleAudience = (value: Audience) => {
    setForm((prev) => {
      if (value === "everyone") return { ...prev, audiences: ["everyone"] };
      const without = prev.audiences.filter((a) => a !== "everyone");
      const next = without.includes(value)
        ? without.filter((a) => a !== value)
        : [...without, value];
      return { ...prev, audiences: next.length ? next : ["everyone"] };
    });
  };


  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("calendar_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event removed");
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dayEvents = byDate.get(selectedDate) ?? [];
  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <section className="panel mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">School calendar</h2>
          <p className="text-sm text-muted-foreground">
            {isStaff
              ? "Post events, exams and deadlines for students and staff."
              : "Events, exams and deadlines posted by your school."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isStaff && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={!isCollapsed}
              aria-label={isCollapsed ? "Expand school calendar" : "Collapse school calendar"}
              onClick={() => setIsCollapsed((v) => !v)}
              className="gap-1"
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="size-4" /> Show
                </>
              ) : (
                <>
                  <ChevronUp className="size-4" /> Hide
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9rem] text-center text-sm font-medium">{monthLabel}</span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {isCollapsed ? (
        <div className="mt-4 flex items-center justify-between rounded-md border border-border bg-muted/30 p-4">
          <div className="text-sm">
            <p className="font-medium">
              {events.length} event{events.length === 1 ? "" : "s"} this month
            </p>
            <p className="text-muted-foreground">
              {dayEvents.length
                ? `${dayEvents.length} on ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
                : "Nothing scheduled for the selected day."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            aria-label="Expand school calendar"
            onClick={() => setIsCollapsed(false)}
          >
            <ChevronDown className="mr-1 size-4" /> Show calendar
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Filter by colour
            </span>
            {COLORS.map((c) => {
              const active = colorFilter.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setColorFilter((prev) =>
                      prev.includes(c.value) ? prev.filter((v) => v !== c.value) : [...prev, c.value],
                    )
                  }
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
                    active
                      ? "border-accent bg-accent/10 font-medium"
                      : "border-border text-muted-foreground hover:border-accent/50"
                  }`}
                >
                  <span className={`size-2.5 rounded-full ${c.dot}`} />
                  {c.label}
                </button>
              );
            })}
            {colorFilter.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setColorFilter([])}>
                Clear
              </Button>
            )}
          </div>



      <div className="mt-5 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        ...
          </div>
        </div>
      </div>
        </>
      )}
    </section>
  );
}
