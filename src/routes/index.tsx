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
      { title: "Meridian — Middle School Gradebook, Attendance & Family Portal" },
      {
        name: "description",
        content:
          "One platform for grades 6-8: gradebook and assignments, attendance and behavior, family messaging, enrollment applications and tuition invoices.",
      },
      {
        property: "og:title",
        content: "Meridian — Middle School Gradebook, Attendance & Family Portal",
      },
      {
        property: "og:description",
        content:
          "Teachers, students, guardians and admins in one middle school platform: grades, attendance, behavior, messaging, enrollment and tuition.",
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
    title: "Enrollment",
    lines: ["Public application form", "Admin review queue", "Roster & class scheduling"],
  },
  {
    icon: CreditCard,
    title: "Tuition & Fees",
    lines: ["Invoices per student", "Paid / unpaid status", "Guardian visibility"],
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    lines: ["Teachers see their classes", "Students see their own work", "Admins see the school"],
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
    copy: "Follow your child's grades, attendance and invoices — no phone calls required.",
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
            <span className="font-display text-lg font-semibold">Meridian</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/apply">Apply to enroll</Link>
            </Button>
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
              Grades 6 – 8
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Simplify teaching for your middle school
            </h1>
            <p className="mt-5 max-w-lg text-base text-primary-foreground/80">
              Gradebook, attendance, behavior, family messaging, enrollment and tuition — one
              student information system your teachers will actually use.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/auth">Open your gradebook</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link to="/apply">Enroll a student</Link>
              </Button>
            </div>
          </div>
          <img
            src={heroImage}
            alt="Teacher entering grades on a laptop in a middle school classroom"
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
          <span>Meridian Middle School Platform</span>
          <Link to="/apply" className="hover:text-foreground">
            Enrollment application
          </Link>
        </div>
      </footer>
    </div>
  );
}
