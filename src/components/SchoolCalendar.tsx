import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MapPin, Plus, Trash2 } from "lucide-react";
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
  { value: "teal", label: "Teal", dot: "bg-accent", chip: "bg-accent/15 text-accent" },
  { value: "navy", label: "Navy", dot: "bg-primary", chip: "bg-primary/15 text-primary" },
  { value: "green", label: "Green", dot: "bg-success", chip: "bg-success/15 text-success" },
  {
    value: "amber",
    label: "Amber",
    dot: "bg-warning",
    chip: "bg-warning/20 text-warning-foreground",
  },
  {
    value: "red",
    label: "Red",
    dot: "bg-destructive",
    chip: "bg-destructive/15 text-destructive",
  },
  {
    value: "slate",
    label: "Slate",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
] as const;

const DEFAULT_COLOR_BY_CATEGORY: Record<string, string> = {
  event: "teal",
  exam: "red",
  deadline: "amber",
  meeting: "navy",
  holiday: "green",
};

function colorOption(value: string) {
  return COLORS.find((c) => c.value === value) ?? COLORS[0];
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
  color: string;
};


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
  const { isStaff, user } = useAuth();
  const queryClient = useQueryClient();
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(toKey(today));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "event",
    audience: "everyone",
    start_time: "",
    end_time: "",
    location: "",
  });

  const monthStart = toKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const monthEnd = toKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

  const { data: events = [] } = useQuery({
    queryKey: ["calendar-events", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, description, event_date, start_time, end_time, location, category, audience")
        .gte("event_date", monthStart)
        .lte("event_date", monthEnd)
        .order("event_date")
        .order("start_time", { nullsFirst: true });
      if (error) throw error;
      return data as EventRow[];
    },
  });

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

  const create = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Give the event a title");
      const { error } = await supabase.from("calendar_events").insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        audience: form.audience as "everyone" | "students" | "parents" | "teachers",
        event_date: selectedDate,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Posted to the school calendar");
      setForm({
        title: "",
        description: "",
        category: "event",
        audience: "everyone",
        start_time: "",
        end_time: "",
        location: "",
      });
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs uppercase tracking-wide text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((date, i) => {
              if (!date) return <div key={`pad-${i}`} />;
              const key = toKey(date);
              const list = byDate.get(key) ?? [];
              const isSelected = key === selectedDate;
              const isToday = key === toKey(today);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={`min-h-16 rounded-md border p-1 text-left transition-colors ${
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <span
                    className={`text-xs font-semibold ${isToday ? "text-accent" : "text-foreground"}`}
                  >
                    {date.getDate()}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-0.5">
                    {list.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`size-1.5 rounded-full ${
                          CATEGORY_TONE[e.category]?.split(" ")[0] ?? "bg-accent/15"
                        } ring-1 ring-current`}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
            {isStaff && (
              <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
                <Plus className="size-4" /> Add
              </Button>
            )}
          </div>

          {isStaff && showForm && (
            <form
              className="mt-3 space-y-3 rounded-md border border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <div>
                <Label htmlFor="cal-title">Title</Label>
                <Input
                  id="cal-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Grade 7 science fair"
                />
              </div>
              <div>
                <Label htmlFor="cal-category">Type</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger id="cal-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cal-audience">Who can see this</Label>
                <Select
                  value={form.audience}
                  onValueChange={(audience) => setForm({ ...form, audience })}
                >
                  <SelectTrigger id="cal-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="cal-start">Starts</Label>
                  <Input
                    id="cal-start"
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="cal-end">Ends</Label>
                  <Input
                    id="cal-end"
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="cal-location">Location</Label>
                <Input
                  id="cal-location"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Gymnasium"
                />
              </div>
              <div>
                <Label htmlFor="cal-desc">Details</Label>
                <Textarea
                  id="cal-desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What students and families need to know"
                />
              </div>
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending ? "Posting…" : "Post event"}
              </Button>
            </form>
          )}

          <div className="mt-3 space-y-3">
            {dayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled for this day.</p>
            ) : (
              dayEvents.map((e) => (
                <article key={e.id} className="rounded-md border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          CATEGORY_TONE[e.category] ?? "bg-accent/15 text-accent"
                        }`}
                      >
                        {CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                      </span>
                      <h4 className="mt-1 text-sm font-semibold">{e.title}</h4>
                      {e.audience !== "everyone" && (
                        <p className="text-xs text-muted-foreground">
                          Visible to {audienceLabel(e.audience).toLowerCase()}
                        </p>
                      )}
                    </div>
                    {isStaff && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${e.title}`}
                        onClick={() => remove.mutate(e.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  {(e.start_time || e.location) && (
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {e.start_time && (
                        <span>
                          {formatTime(e.start_time)}
                          {e.end_time ? ` – ${formatTime(e.end_time)}` : ""}
                        </span>
                      )}
                      {e.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {e.location}
                        </span>
                      )}
                    </p>
                  )}
                  {e.description && (
                    <p className="mt-2 text-sm text-muted-foreground">{e.description}</p>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
