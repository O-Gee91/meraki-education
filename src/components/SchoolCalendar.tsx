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
  class_ids: string[] | null;
  grade_level: number | null;
  color: string;
};

type ClassOption = {
  id: string;
  name: string;
  grade_level: number | null;
  teacher_id: string | null;
  teacher_name: string;
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
  const { isStaff, isAdmin, user, profile } = useAuth();
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
    grade_level: null as number | null,
    class_ids: [] as string[],
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

  const { data: allClasses = [] } = useQuery({
    queryKey: ["calendar-scope-classes", user?.id],
    enabled: isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name, grade_level, teacher_id, teacher_name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ClassOption[];
    },
  });

  // Teachers can only target the grades and classes they actually teach;
  // admins may reach the whole school.
  const myName = (profile?.full_name ?? "").trim().toLowerCase();
  const myClasses = isAdmin
    ? allClasses
    : allClasses.filter(
        (c) =>
          c.teacher_id === user?.id ||
          (!!myName && (c.teacher_name ?? "").trim().toLowerCase() === myName),
      );
  const myGrades = [...new Set(myClasses.map((c) => c.grade_level).filter((g): g is number => g != null))].sort(
    (a, b) => a - b,
  );
  const classNameById = new Map(allClasses.map((c) => [c.id, c.name]));

  // A teacher's events default to their whole grade level.
  useEffect(() => {
    if (editingId || isAdmin || !myGrades.length) return;
    setForm((prev) =>
      prev.grade_level != null || prev.class_ids.length ? prev : { ...prev, grade_level: myGrades[0]! },
    );
  }, [editingId, isAdmin, myGrades]);

  const monthStart = toKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const monthEnd = toKey(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

  const { data: allEvents = [] } = useQuery({
    queryKey: ["calendar-events", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select(
          "id, title, description, event_date, start_time, end_time, location, category, audience, audiences, color, class_id, class_ids, grade_level",
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
      // Teachers must aim at their own grade or their own classes — never
      // another grade, never the whole school.
      if (!isAdmin) {
        if (form.grade_level == null && form.class_ids.length === 0) {
          throw new Error("Pick your grade level or at least one of your classes");
        }
        if (form.grade_level != null && !myGrades.includes(form.grade_level)) {
          throw new Error("You can only share with the grade level you teach");
        }
        const ownIds = new Set(myClasses.map((c) => c.id));
        if (form.class_ids.some((id) => !ownIds.has(id))) {
          throw new Error("You can only share with classes you teach");
        }
      }
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
        grade_level: form.grade_level,
        class_ids: form.class_ids.length ? form.class_ids : null,
        class_id: form.class_ids[0] ?? null,
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
      grade_level: e.grade_level,
      class_ids: e.class_ids?.length ? e.class_ids : e.class_id ? [e.class_id] : [],
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
                        {list.slice(0, 4).map((e) => (
                          <span
                            key={e.id}
                            className={`size-1.5 rounded-full ${colorOption(e.color).dot}`}
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
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (showForm) {
                        cancelEdit();
                      } else {
                        setEditingId(null);
                        setForm({ ...emptyForm, event_date: selectedDate });
                        setShowForm(true);
                      }
                    }}
                  >
                    <Plus className="size-4" /> Add
                  </Button>
                )}
              </div>

              {isStaff && showForm && (
                <form
                  className="mt-3 space-y-3 rounded-md border border-border p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save.mutate();
                  }}
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {editingId ? "Edit event" : "New event"}
                  </p>
                  <div>
                    <Label htmlFor="cal-date">Date</Label>
                    <Input
                      id="cal-date"
                      type="date"
                      value={form.event_date || selectedDate}
                      onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                    />
                  </div>
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
                      onValueChange={(v) =>
                        setForm({ ...form, category: v, color: DEFAULT_COLOR_BY_CATEGORY[v] ?? form.color })
                      }
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
                    <Label>Colour</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          aria-label={c.label}
                          aria-pressed={form.color === c.value}
                          onClick={() => setForm({ ...form, color: c.value })}
                          title={c.description}
                          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors ${
                            form.color === c.value
                              ? "border-accent bg-accent/10 font-medium"
                              : "border-border text-muted-foreground hover:border-accent/50"
                          }`}
                        >
                          <span className={`size-2.5 rounded-full ${c.dot}`} />
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {colorOption(form.color).description}
                    </p>
                  </div>
                  <div>
                    <Label>Who is this for</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {isAdmin && (
                        <button
                          type="button"
                          aria-pressed={form.grade_level == null && form.class_ids.length === 0}
                          onClick={() => setForm({ ...form, grade_level: null, class_ids: [] })}
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            form.grade_level == null && form.class_ids.length === 0
                              ? "border-accent bg-accent/10 font-medium"
                              : "border-border text-muted-foreground hover:border-accent/50"
                          }`}
                        >
                          Whole school
                        </button>
                      )}
                      {myGrades.map((g) => {
                        const active = form.grade_level === g;
                        return (
                          <button
                            key={`grade-${g}`}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setForm({ ...form, grade_level: g, class_ids: [] })}
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              active
                                ? "border-accent bg-accent/10 font-medium"
                                : "border-border text-muted-foreground hover:border-accent/50"
                            }`}
                          >
                            All of Grade {g}
                          </button>
                        );
                      })}
                      {myClasses.map((c) => {
                        const active = form.class_ids.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() =>
                              setForm((prev) => {
                                const next = prev.class_ids.includes(c.id)
                                  ? prev.class_ids.filter((id) => id !== c.id)
                                  : [...prev.class_ids, c.id];
                                return {
                                  ...prev,
                                  class_ids: next,
                                  grade_level: next.length ? null : prev.grade_level,
                                };
                              })
                            }
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              active
                                ? "border-accent bg-accent/10 font-medium"
                                : "border-border text-muted-foreground hover:border-accent/50"
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.grade_level != null
                        ? `Every Grade ${form.grade_level} class and their families will see it.`
                        : form.class_ids.length
                          ? "Only the selected classes and their families will see it."
                          : isAdmin
                            ? "Everyone at the school will see it."
                            : "Pick your grade level or one or more of your classes."}
                    </p>
                  </div>
                  <div>
                    <Label>Notices — who can see this</Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {AUDIENCES.map((a) => {
                        const active = form.audiences.includes(a.value as Audience);
                        return (
                          <button
                            key={a.value}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleAudience(a.value as Audience)}
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              active
                                ? "border-accent bg-accent/10 font-medium"
                                : "border-border text-muted-foreground hover:border-accent/50"
                            }`}
                          >
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pick several groups, or choose everyone.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="cal-start">Starts</Label>
                      <TimeSelect
                        id="cal-start"
                        value={form.start_time}
                        onChange={(v) => setForm({ ...form, start_time: v })}
                        placeholder="No start time"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cal-end">Ends</Label>
                      <TimeSelect
                        id="cal-end"
                        value={form.end_time}
                        onChange={(v) => setForm({ ...form, end_time: v })}
                        placeholder="No end time"
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
                  <div className="flex items-center gap-2">
                    <Button type="submit" size="sm" disabled={save.isPending}>
                      {save.isPending
                        ? "Saving…"
                        : editingId
                          ? "Save changes"
                          : "Post event"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              <div className="mt-3 space-y-3">
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing scheduled for this day.</p>
                ) : (
                  dayEvents.map((e) => (
                    <article
                      key={e.id}
                      className={`rounded-md border border-border border-l-4 p-3 ${colorOption(e.color).edge}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                              colorOption(e.color).chip
                            }`}
                          >
                            <span className={`size-2 rounded-full ${colorOption(e.color).dot}`} />
                            {CATEGORIES.find((c) => c.value === e.category)?.label ?? e.category}
                          </span>
                          <h4 className="mt-1 text-sm font-semibold">{e.title}</h4>
                          {(() => {
                            const list = (e.audiences?.length ? e.audiences : [e.audience]) as string[];
                            if (list.length === 1 && list[0] === "everyone") return null;
                            return (
                              <p className="text-xs text-muted-foreground">
                                Visible to{" "}
                                {list.map((a) => audienceLabel(a).toLowerCase()).join(", ")}
                              </p>
                            );
                          })()}
                        </div>

                        {isStaff && (
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Edit ${e.title}`}
                              onClick={() => startEdit(e)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove ${e.title}`}
                              onClick={() => remove.mutate(e.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
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
        </>
      )}
    </section>
  );
}
