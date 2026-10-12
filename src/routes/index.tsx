import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown, GraduationCap } from "lucide-react";
import heroImage from "@/assets/hero-classroom.jpg";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

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
    copy: "Take roll in seconds, enter grades online, and log behavior without leaving the class page.",
  },
  {
    who: "Students",
    copy: "Every assignment, score and missing item for all periods on one screen.",
  },
  {
    who: "Parents/Guardians",
    copy: "Follow your child's grades, attendance and behavior — no phone calls required.",
  },
  {
    who: "Admins",
    copy: "Review enrollment applications, manage rosters, and see the whole school in real time.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background [&_h1]:tracking-normal [&_h2]:tracking-normal [&_h3]:tracking-normal">
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <GraduationCap className="size-6 shrink-0 text-primary" />
            <span className="font-display text-base font-semibold sm:text-lg">Meraki Education</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main>
      <section className="relative isolate overflow-hidden text-landing-foreground" aria-labelledby="landing-title">
          <img
            src={heroImage}
            alt=""
            width={1600}
            height={1104}
            fetchPriority="high"
            className="absolute inset-0 -z-20 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 -z-10 bg-landing-scrim/75" />
        <div className="mx-auto flex min-h-[min(480px,60dvh)] w-full max-w-6xl items-center px-6 py-12 sm:py-16">
          <div className="max-w-xl">
            <p className="mb-4 text-sm font-medium text-landing-foreground/85">Grades 5–9</p>
            <h1 id="landing-title" className="text-4xl font-semibold leading-tight sm:text-5xl">Meraki Education</h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-landing-foreground/90">
              Your school day, connected. Grades, attendance, coursework and family messages in one place.
            </p>
            <Button asChild size="lg" variant="secondary" className="mt-8 h-11">
              <Link to="/auth">Sign in to Meraki <ArrowRight aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold">Everything the school day needs</h2>
          <div className="mt-8 grid items-start gap-8 md:grid-cols-3">
            {PILLARS.map((p) => (
              <div key={p.title} className="min-w-0 border-t border-border pt-5">
                <h3 className="text-base font-semibold">{p.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.blurb}</p>
                <details className="group mt-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    Explore {p.title.toLowerCase()}
                    <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  </summary>
                <ul className="mt-4 space-y-3 text-sm">
                  {p.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
                </details>
              </div>
            ))}
          </div>
      </section>

      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold">For your school community</h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map((a) => (
              <div key={a.who}>
                <h3 className="text-base font-semibold">{a.who}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      </main>
      <footer className="border-t border-border/60 bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span>Meraki Education Platform</span>
          <Link to="/auth" search={{}} className="hover:text-foreground">
            Account access <span aria-hidden="true">→</span>
          </Link>
        </div>
      </footer>
    </div>
  );
}
