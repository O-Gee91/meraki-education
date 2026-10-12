import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { History, Paperclip, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/feedback-loop-preview")({
  head: () => ({
    meta: [
      { title: "Feedback loop preview — Meraki Education" },
      { name: "description", content: "Try the proposed assignment and feedback workflow with sample data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "Feedback loop preview — Meraki Education" },
      { property: "og:description", content: "Try the proposed assignment and feedback workflow with sample data." },
    ],
  }),
  component: PreviewPage,
});

type Status = "unsubmitted" | "submitted" | "late" | "graded";
type Sub = {
  id: string;
  student: string;
  status: Status;
  submittedAt?: string;
  text?: string;
  file?: string;
  score?: number;
  feedback?: string;
  posted: boolean;
};
type Change = { at: string; by: string; old?: number; next?: number; note: string };

const DUE = "Oct 14, 3:00 PM";
const POINTS = 100;

const INITIAL: Sub[] = [
  { id: "1", student: "Chen, Alex 陈亚历", status: "submitted", submittedAt: "Oct 12, 10:14 AM", text: "Revised the thesis in the intro and added evidence in paragraph 3.", file: "alex_essay_v2.docx", posted: false },
  { id: "2", student: "Li, Mei 李美", status: "late", submittedAt: "Oct 15, 8:02 AM", text: "Sorry this is late — I was sick on Tuesday.", file: "mei_narrative.pdf", posted: false },
  { id: "3", student: "Wang, Jay 王杰", status: "graded", submittedAt: "Oct 13, 7:45 PM", text: "Final draft attached.", file: "jay_final.docx", score: 88, feedback: "Clear structure. Work on transitions.", posted: true },
  { id: "4", student: "Zhang, Lucy 张露西", status: "unsubmitted", posted: false },
  { id: "5", student: "Doyle, Sam", status: "graded", submittedAt: "Oct 14, 1:10 PM", text: "Here is my essay.", file: "sam_essay.docx", score: 92, feedback: "Strong voice!", posted: false },
];

const STUDENT_ROWS = [
  { cls: "G7 English", title: "Narrative Essay", due: "Oct 14", status: "Due soon", score: "—" },
  { cls: "G7 Math", title: "Linear Equations Quiz", due: "Oct 10", status: "Missing", score: "—" },
  { cls: "G7 Science", title: "Photosynthesis Lab", due: "Oct 5", status: "Graded", score: "95% · A" },
  { cls: "G7 History", title: "Silk Road Map", due: "Oct 3", status: "Graded", score: "84% · B" },
];

function chip(s: Sub) {
  if (s.status === "unsubmitted") return { label: "Missing", tone: "border-warning/40 text-warning" };
  if (s.score !== undefined) return { label: s.posted ? "Graded" : "Draft grade", tone: s.posted ? "border-success/40 text-success" : "border-border text-muted-foreground" };
  if (s.status === "late") return { label: "Late", tone: "border-destructive/40 text-destructive" };
  return { label: "Submitted", tone: "border-primary/40 text-primary" };
}

function PreviewPage() {
  const [subs, setSubs] = useState<Sub[]>(INITIAL);
  const [history, setHistory] = useState<Record<string, Change[]>>({
    "3": [{ at: "Oct 14, 4:20 PM", by: "Ms. Doyle", next: 88, note: "Posted grade" }],
  });

  return (
    <AppShell
      title="Assignment & feedback preview"
      description="Prototype with sample data — nothing here is saved or shared with students."
      desktopReview
    >
      <div className="mb-6 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <span>Preview only. Changes reset when you leave this page.</span>
      </div>
      <Tabs defaultValue="teacher">
        <TabsList>
          <TabsTrigger value="teacher">Teacher grading</TabsTrigger>
          <TabsTrigger value="gradebook">Gradebook</TabsTrigger>
          <TabsTrigger value="student">Student view</TabsTrigger>
          <TabsTrigger value="guardian">Guardian view</TabsTrigger>
        </TabsList>
        <TabsContent value="teacher" className="mt-6">
          <TeacherGrading subs={subs} setSubs={setSubs} setHistory={setHistory} />
        </TabsContent>
        <TabsContent value="gradebook" className="mt-6">
          <Gradebook subs={subs} history={history} />
        </TabsContent>
        <TabsContent value="student" className="mt-6">
          <StudentHub sub={subs[0]} />
        </TabsContent>
        <TabsContent value="guardian" className="mt-6">
          <GuardianView sub={subs[0]} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function TeacherGrading({
  subs,
  setSubs,
  setHistory,
}: {
  subs: Sub[];
  setSubs: React.Dispatch<React.SetStateAction<Sub[]>>;
  setHistory: React.Dispatch<React.SetStateAction<Record<string, Change[]>>>;
}) {
  const [selected, setSelected] = useState(subs[0].id);
  const current = subs.find((s) => s.id === selected)!;
  const [score, setScore] = useState(current.score?.toString() ?? "");
  const [feedback, setFeedback] = useState(current.feedback ?? "");

  const pick = (id: string) => {
    const s = subs.find((x) => x.id === id)!;
    setSelected(id);
    setScore(s.score?.toString() ?? "");
    setFeedback(s.feedback ?? "");
  };

  const save = (post: boolean) => {
    const n = score === "" ? undefined : Math.max(0, Math.min(POINTS, Number(score)));
    if (post && n === undefined) return toast.error("Enter a score before posting.");
    if (post) {
      setHistory((h) => ({
        ...h,
        [current.id]: [
          ...(h[current.id] ?? []),
          { at: new Date().toLocaleString(), by: "You", old: current.posted ? current.score : undefined, next: n, note: current.posted ? "Updated posted grade" : "Posted grade" },
        ],
      }));
    }
    setSubs((all) => all.map((s) => (s.id === current.id ? { ...s, score: n, feedback, posted: post } : s)));
    toast.success(post ? "Grade posted — visible to student and guardian." : "Draft saved — only you can see it.");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
      <div>
        <h2 className="mb-1 text-lg font-semibold">Narrative Essay</h2>
        <p className="mb-4 text-sm text-muted-foreground">G7 English · Due {DUE} · {POINTS} pts</p>
        <ul className="divide-y divide-border border-y border-border">
          {subs.map((s) => {
            const c = chip(s);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pick(s.id)}
                  aria-pressed={s.id === selected}
                  className={cn("flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm hover:bg-muted/60", s.id === selected && "bg-muted")}
                >
                  <span className="font-medium">{s.student}</span>
                  <Badge variant="outline" className={c.tone}>{c.label}</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-md border border-border p-5">
          <h3 className="mb-3 font-semibold">{current.student}</h3>
          {current.status === "unsubmitted" ? (
            <p className="text-sm text-muted-foreground">No submission yet. It will count as 0 only once you post grades for this assignment.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Submitted {current.submittedAt}
                {current.status === "late" && <Badge variant="outline" className="ml-2 border-destructive/40 text-destructive">Late</Badge>}
              </p>
              <p className="flex items-center gap-2"><Paperclip className="h-4 w-4" aria-hidden />{current.file}</p>
              <p className="max-w-prose whitespace-pre-wrap">{current.text}</p>
            </div>
          )}
        </section>

        <section className="space-y-4 rounded-md border border-border p-5">
          <div>
            <Label htmlFor="pv-score">Score (out of {POINTS})</Label>
            <Input id="pv-score" type="number" min={0} max={POINTS} className="mt-1 h-11 w-32" value={score} onChange={(e) => setScore(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pv-fb">Feedback</Label>
            <Textarea id="pv-fb" rows={5} className="mt-1" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Comments the student will see once posted" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-11" onClick={() => save(false)}>Save draft</Button>
            <Button className="h-11" onClick={() => save(true)}>Post grade</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {current.posted ? "Posted — the student and guardian can see this grade." : "Not posted — only staff can see this."}
          </p>
        </section>
      </div>
    </div>
  );
}

function Gradebook({ subs, history }: { subs: Sub[]; history: Record<string, Change[]> }) {
  const posted = subs.filter((s) => s.posted && s.score !== undefined);
  const avg = posted.length ? (posted.reduce((a, s) => a + (s.score ?? 0), 0) / posted.length).toFixed(1) : null;
  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Posted average: <span className="font-semibold text-foreground">{avg ? `${avg}%` : "No grades yet"}</span> · drafts are excluded from averages and report cards.
      </p>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 font-medium">Student</th>
            <th className="w-48 py-2 font-medium">Narrative Essay</th>
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id} className="border-b border-border">
              <td className="py-3">{s.student}</td>
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <span>{s.score !== undefined ? `${s.score}` : s.status === "unsubmitted" ? "—" : "Ungraded"}</span>
                  {s.score !== undefined && !s.posted && (
                    <span className="inline-flex items-center gap-1 text-xs text-warning">
                      <span className="h-2 w-2 rounded-full bg-warning" aria-hidden />Draft
                    </span>
                  )}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Grade history for ${s.student}`}>
                        <History className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 text-sm">
                      <p className="mb-2 font-semibold">Grade history</p>
                      {(history[s.id] ?? []).length === 0 ? (
                        <p className="text-muted-foreground">No posted changes yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {history[s.id].map((h, i) => (
                            <li key={i} className="border-b border-border pb-2 last:border-0">
                              <p>{h.note}: {h.old ?? "—"} → {h.next ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{h.by} · {h.at}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FILTERS = ["All", "Due soon", "Missing", "Graded"] as const;

function StudentHub({ sub }: { sub: Sub }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => {
    const essay = { ...STUDENT_ROWS[0], status: sub.posted ? "Graded" : "Submitted", score: sub.posted && sub.score !== undefined ? `${sub.score}%` : "—" };
    const all = [essay, ...STUDENT_ROWS.slice(1)];
    return filter === "All" ? all : all.filter((r) => r.status === filter);
  }, [filter, sub]);
  const missing = STUDENT_ROWS.filter((r) => r.status === "Missing").length;

  if (open) {
    return (
      <div className="max-w-2xl space-y-4">
        <Button variant="ghost" onClick={() => setOpen(false)}>← Back to assignments</Button>
        <h2 className="text-xl font-semibold">Narrative Essay</h2>
        <p className="text-sm text-muted-foreground">G7 English · Due {DUE}</p>
        <p className="max-w-prose text-sm">Write a 600–800 word narrative about a moment that changed how you see something.</p>
        {sub.posted ? (
          <section className="space-y-2 rounded-md border border-border p-5">
            <p className="text-2xl font-semibold">{sub.score} / {POINTS}</p>
            <p className="text-sm">{sub.feedback || "No written feedback."}</p>
          </section>
        ) : (
          <section className="rounded-md border border-border p-5 text-sm text-muted-foreground">
            Submitted {sub.submittedAt}. Your teacher hasn't posted a grade yet.
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={() => setFilter("Missing")} className="flex w-full max-w-sm items-center justify-between rounded-md border border-warning/40 p-4 text-left">
        <span><span className="block text-sm text-muted-foreground">Missing work</span><span className="text-2xl font-semibold">{missing}</span></span>
        <span className="text-sm text-primary">View →</span>
      </button>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "secondary" : "ghost"} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f}</Button>
        ))}
      </div>
      <AssignmentTable rows={rows} onOpen={() => setOpen(true)} />
    </div>
  );
}

function GuardianView({ sub }: { sub: Sub }) {
  const rows = [
    { ...STUDENT_ROWS[0], status: sub.posted ? "Graded" : "Submitted", score: sub.posted && sub.score !== undefined ? `${sub.score}%` : "—" },
    ...STUDENT_ROWS.slice(1),
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Read-only view for Alex's family. Draft grades never appear here.</p>
      <AssignmentTable rows={rows} />
    </div>
  );
}

function AssignmentTable({ rows, onOpen }: { rows: typeof STUDENT_ROWS; onOpen?: () => void }) {
  return (
    <table className="w-full table-fixed text-sm">
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th className="py-2 font-medium">Class</th>
          <th className="py-2 font-medium">Assignment</th>
          <th className="py-2 font-medium">Due</th>
          <th className="py-2 font-medium">Status</th>
          <th className="py-2 font-medium">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.title} className="border-b border-border">
            <td className="py-3 text-muted-foreground">{r.cls}</td>
            <td className="py-3">
              {onOpen && r.title === "Narrative Essay" ? (
                <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onOpen}>{r.title}</button>
              ) : (
                <span className="font-medium">{r.title}</span>
              )}
            </td>
            <td className="py-3">{r.due}</td>
            <td className="py-3"><Badge variant="outline" className={r.status === "Missing" ? "border-warning/40 text-warning" : r.status === "Graded" ? "border-success/40 text-success" : ""}>{r.status}</Badge></td>
            <td className="py-3">{r.score}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
