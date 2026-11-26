import { useId, type ReactNode } from "react";
import { useNotebookStyle } from "@/components/NotebookStyle";
import { seededRandom, sketchBox, sketchCircle, sketchLine, sketchTick, sketchTally, sketchMood } from "@/lib/sketch";
export function Sketch({ seed, kind = "circle", tone = "ink", className = "", count = 0, mood = 3 }: { seed: string; kind?: "circle" | "box" | "line" | "strike" | "tick" | "doodle" | "plane" | "tally" | "mood"; tone?: "ink" | "blue" | "red"; className?: string; count?: number; mood?: number }) {
  const style = useNotebookStyle();
  const id = `sketch-chalk-${useId().replace(/:/g, "")}`;
  if (style !== "notebook") return null;
  const rand = seededRandom(seed);
  const paths = kind === "circle" ? [sketchCircle(50, 25, 46, 21, rand)]
    : kind === "box" ? sketchBox(3, 3, 94, 44, rand)
    : kind === "tick" ? sketchTick(25, 5, 38, rand)
    : kind === "tally" ? sketchTally(count, rand)
    : kind === "mood" ? sketchMood(mood, rand)
    : kind === "plane" ? ["M 6 24 L 92 5 L 63 45 L 46 30 L 92 5 L 39 25 Z", "M 46 30 L 43 44 L 54 36"]
    : kind === "doodle" ? ["M 21 4 L 26 18 L 42 18 L 29 28 L 34 44 L 21 34 L 8 44 L 13 28 L 1 18 L 16 18 Z", "M 49 34 C 52 7 94 6 92 28 C 90 47 59 45 61 27 C 63 15 80 16 81 27 C 82 35 70 36 71 27"]
    : [sketchLine(4, kind === "strike" ? 42 : 25, 96, kind === "strike" ? 8 : 25, rand)];
  const width = kind === "tally" ? Math.max(32, Math.ceil(count / 5) * 32) : 100;
  return <svg className={`sketch sketch-${tone} sketch-${kind} ${className}`} viewBox={`0 0 ${width} 50`} preserveAspectRatio={kind === "tally" ? "xMinYMid meet" : "none"} aria-hidden="true" focusable="false">
    <defs><filter id={id} x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" result="grain" /><feComposite in="SourceGraphic" in2="grain" operator="in" /></filter></defs>
    <g className="sketch-light">{paths.map((d, i) => <path key={i} d={d} />)}</g>
    <g className="sketch-dark" filter={`url(#${id})`}>{paths.map((d, i) => <path key={i} d={d} />)}</g>
  </svg>;
}
export function NotebookGrade({ children, seed, marked = true }: { children: ReactNode; seed: string; marked?: boolean }) {
  return <span className="notebook-grade">{children}{marked && <Sketch seed={seed} tone="red" />}</span>;
}