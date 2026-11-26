import { useId, type ReactNode } from "react";
import { useNotebookStyle } from "@/components/NotebookStyle";
import {
  seededRandom,
  sketchArrow,
  sketchBox,
  sketchCircle,
  sketchDoodle,
  sketchGrid,
  sketchLine,
  sketchPlane,
  sketchTick,
  sketchTally,
  sketchMood,
} from "@/lib/sketch";

export function Sketch({
  seed,
  kind = "circle",
  tone = "ink",
  className = "",
  count = 0,
  mood = 3,
  cols = 7,
  rows = 5,
  draw = false,
}: {
  seed: string;
  kind?: "circle" | "box" | "line" | "strike" | "tick" | "doodle" | "plane" | "tally" | "mood" | "grid" | "arrow";
  tone?: "ink" | "blue" | "red";
  className?: string;
  count?: number;
  mood?: number;
  cols?: number;
  rows?: number;
  draw?: boolean;
}) {
  const style = useNotebookStyle();
  const id = `sketch-chalk-${useId().replace(/:/g, "")}`;
  if (style !== "notebook") return null;
  const rand = seededRandom(seed);
  const paths = kind === "circle" ? [sketchCircle(50, 25, 46, 21, rand)]
    : kind === "box" ? sketchBox(3, 3, 94, 44, rand)
    : kind === "tick" ? sketchTick(25, 5, 38, rand)
    : kind === "tally" ? sketchTally(count, rand)
    : kind === "mood" ? sketchMood(mood, rand)
    : kind === "plane" ? sketchPlane(rand)
    : kind === "doodle" ? sketchDoodle(rand)
    : kind === "grid" ? sketchGrid(cols, rows, rand)
    : kind === "arrow" ? sketchArrow(92, 25, 8, 25, rand)
    : [sketchLine(4, kind === "strike" ? 42 : 25, 96, kind === "strike" ? 8 : 25, rand)];
  const width = kind === "tally" ? Math.max(32, Math.ceil(count / 5) * 32) : 100;
  const height = kind === "grid" ? 100 : 50;
  const animate = draw && kind !== "grid";
  return (
    <svg
      className={`sketch sketch-${tone} sketch-${kind} ${animate ? "sketch-draw" : ""} ${className}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={kind === "tally" ? "xMinYMid meet" : "none"}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id={id} x="-8%" y="-12%" width="116%" height="124%">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="3" result="grain" />
          <feDisplacementMap in="SourceGraphic" in2="grain" scale="0.55" />
        </filter>
      </defs>
      <g className="sketch-light">{paths.map((d, i) => <path key={i} d={d} pathLength={animate ? 1 : undefined} />)}</g>
      <g className="sketch-dark" filter={`url(#${id})`}>{paths.map((d, i) => <path key={i} d={d} pathLength={animate ? 1 : undefined} />)}</g>
    </svg>
  );
}

export function NotebookGrade({ children, seed, marked = true }: { children: ReactNode; seed: string; marked?: boolean }) {
  return <span className="notebook-grade notebook-data">{children}{marked && <Sketch seed={seed} tone="red" />}</span>;
}
