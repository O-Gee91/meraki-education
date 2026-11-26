import { useId, type ReactNode } from "react";
import { useNotebookStyle } from "@/components/NotebookStyle";
import { seededRandom, sketchBox, sketchCircle, sketchLine } from "@/lib/sketch";
export function Sketch({ seed, kind = "circle", tone = "ink", className = "" }: { seed: string; kind?: "circle" | "box" | "line" | "strike"; tone?: "ink" | "blue" | "red"; className?: string }) {
  const style = useNotebookStyle();
  const id = `sketch-chalk-${useId().replace(/:/g, "")}`;
  if (style !== "notebook") return null;
  const rand = seededRandom(seed);
  const paths = kind === "circle" ? [sketchCircle(50, 25, 46, 21, rand)] : kind === "box" ? sketchBox(3, 3, 94, 44, rand) : [sketchLine(4, kind === "strike" ? 42 : 25, 96, kind === "strike" ? 8 : 25, rand)];
  return <svg className={`sketch sketch-${tone} sketch-${kind} ${className}`} viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs><filter id={id} x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" result="grain" /><feComposite in="SourceGraphic" in2="grain" operator="in" /></filter></defs>
    <g className="sketch-light">{paths.map((d, i) => <path key={i} d={d} />)}</g>
    <g className="sketch-dark" filter={`url(#${id})`}>{paths.map((d, i) => <path key={i} d={d} />)}</g>
  </svg>;
}
export function NotebookGrade({ children, seed, marked = true }: { children: ReactNode; seed: string; marked?: boolean }) {
  return <span className="notebook-grade">{children}{marked && <Sketch seed={seed} tone="red" />}</span>;
}