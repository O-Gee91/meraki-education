import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarCheck,
  ClipboardList,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  GraduationCap,
} from "lucide-react";
import heroImage from "@/assets/hero-classroom.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
      meta: [
      { title: "Meraki — K-12 School Gradebook, Attendance & Family Portal" },
      {
        name: "description",
        content:
          "One platform for grades 5-9: gradebook and assignments, attendance and behavior, family messaging, standards-based reporting and file sharing.",
      },
      {
        property: "og:title",
        content: "Meraki — K-12 School Gradebook, Attendance & Family Portal",
      },
      {
        property: "og:description",
        content:
          "Teachers, students, guardians and admins in one K-12 school platform: grades, attendance, behavior, messaging, rosters and reporting.",
      },
    ],
  }),
  component: Landing,
});

const MODULES = [
  {
    icon: ClipboardList,
    title: "Gradebook",
    lines: ["Assignments & categories", "Points, comments, averages", "Letter grades at a glance"],
  },
  {
    icon: CalendarCheck,
    title: "Attendance & Behavior",
    lines: ["Daily roll per class", "Tardy & absence tracking", "Positive and concern notes"],
  },
  {
    icon: MessageSquare,
    title: "Communications",
    lines: ["Direct messages", "Class & school announcements", "Guardians stay in the loop"],
  },
  {
    icon: BookOpen,
    title: "Rosters & Scheduling",
    lines: ["Import students from a spreadsheet", "Create student & guardian logins", "Roster & class scheduling"],
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    lines: ["Teachers see their classes", "Students see their own work", "Admins see the school"],
  },
];

const PILLARS = [
  {
    title: "Community",
    blurb:
      "Safe, social spaces for every class and group in the school, plus a news river families actually read.",
    items: [
      "Social classrooms with posts, replies and pinned updates",
      "Groups for clubs, teams and professional learning — school-wide or staff-only",
      "School news river for students and guardians",
      "Confidential messaging with no address books to manage",
      "Shared links and resources preserved in each space",
    ],
  },
  {
    title: "Classroom Management",
    blurb:
      "Everything a teacher does between the bells: seating, roll, quick checks and how students are really doing.",
    items: [
      "Seating plans generated from the roster, printable for substitutes",
      "Real-time attendance with tardies, absences and notes",
      "Emotional check-ins with research-based follow-up strategies",
      "Instant polls with optional shared results",
      "Behavior logging for both recognition and concerns",
    ],
  },
  {
    title: "Assessment & Reporting",
    blurb:
      "One gradebook that rolls straight into standards coverage, report cards and portfolios of real work.",
    items: [
      "Feature-rich gradebook with categories, comments and averages",
      "Standards-based grading tied to expectations and outcomes",
      "Term report cards generated from the gradebook, published when you're ready",
      "Portfolios of learning evidence students and families can see",
      "Letter grades, weighting and at-a-glance class insight",
    ],
  },
];

const AUDIENCES = [

  {
    who: "Teachers",
    copy: "Take roll in seconds, enter grades inline, and log behavior without leaving the class page.",
  },
  {
    who: "Students",
    copy: "Every assignment, score and missing item for all six periods on one screen.",
  },
  {
    who: "Guardians",
    copy: "Follow your child's grades, attendance and behavior — no phone calls required.",
  },
  {
    who: "Admins",
    copy: "Review enrollment applications, manage rosters, and see the whole school in real time.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-6 text-accent" />
            <span className="font-display text-lg font-semibold">Meraki Education</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="surface-deep">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-16 md:grid-cols-2 md:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary-foreground/70">
              {"\n"}
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Simplify teaching for your school
            </h1>
            <p className="mt-5 max-w-lg text-base text-primary-foreground/80">
              Gradebook, attendance, behavior, family messaging, rosters and reporting — one
              student information system your teachers will actually use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth">Open your gradebook</Link>
              </Button>
            </div>
          </div>
          <img
            src={heroImage}
            alt="Teacher entering grades on a laptop in a classroom"
            width={1600}
            height={1100}
            className="rounded-xl shadow-[var(--shadow-float)]"
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-semibold">Everything the school day needs</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <div key={m.title} className="panel p-5">
              <m.icon className="size-6 text-accent" />
              <h3 className="mt-4 text-base font-semibold">{m.title}</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {m.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-secondary/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold">Three pillars of the platform</h2>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Community, classroom management, and assessment and reporting — connected, so nothing
            has to be re-entered.
          </p>
          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="panel p-6">
                <h3 className="font-display text-xl font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.blurb}</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {p.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>



      <section className="border-y border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold">Everybody wins</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <div key={a.who}>
                <h3 className="text-base font-semibold">{a.who}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{a.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="panel flex flex-wrap items-center justify-between gap-6 p-8">
          <div>
            <h2 className="text-xl font-semibold">Ready for the new term?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create a staff account, add your classes, and start taking roll today.
            </p>
          </div>
          <Button asChild size="lg">
            <Link to="/auth">Get started</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span>Meraki Education Platform</span>
          <Link to="/auth" search={{}} className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
