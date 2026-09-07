import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { DynamicScoringInterface } from "@/components/class/DynamicScoringInterface";

export const Route = createFileRoute("/_authenticated/score")({
  component: ScorePage,
  head: () => ({
    meta: [
      { title: "Dynamic Scoring | Meraki Education" },
      { name: "description", content: "Build and score custom criteria sets for any assignment or observation." },
      { property: "og:title", content: "Dynamic Scoring | Meraki Education" },
      { property: "og:description", content: "Build and score custom criteria sets for any assignment or observation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ScorePage() {
  return (
    <AppShell
      title="Dynamic Scoring"
      description="Create criteria, assign scores, and see totals in real time."
    >
      <div className="py-6">
        <DynamicScoringInterface
          onSubmit={(payload) => {
            // eslint-disable-next-line no-console
            console.log("Scoring submitted:", payload);
          }}
        />
      </div>
    </AppShell>
  );
}
