import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { StudentHero } from "@/components/StudentHero";
import { StudentQuest } from "@/components/StudentQuest";

/** Collapsed-by-default shell holding the full gamified hero experience. */
export function HeroProfilePanel() {
  const [open, setOpen] = useState(false);

  return (
    <section className="panel mb-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">Hero profile</span>
          <span className="block truncate text-xs text-muted-foreground">
            Attributes, XP ring, quest log, loot log, party board and achievements
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "Hide" : "Open"}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-border p-4">
          <StudentHero />
          <StudentQuest />
        </div>
      )}
    </section>
  );
}
