import { type ReactNode } from "react";
import { useNotebookStyle } from "@/components/NotebookStyle";
import { Sketch } from "@/components/Sketch";

export function NotebookEmpty({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`notebook-empty ${className}`}><span className="notebook-empty-mark"><Sketch seed="empty-margin" kind="doodle" /></span><p>{children}</p></div>;
}

export function NotebookMood({ value, emoji }: { value: number; emoji: string }) {
  const style = useNotebookStyle();
  return <span aria-hidden="true" className={style === "notebook" ? "notebook-mood" : "text-2xl"}>{style === "notebook" ? <Sketch seed={`mood:${value}`} kind="mood" mood={value} /> : emoji}</span>;
}

export function NotebookAttendance({ counts, seed }: { counts: { label: string; count: number }[]; seed: string }) {
  const style = useNotebookStyle();
  if (style !== "notebook") return null;
  return <dl className="notebook-attendance" aria-label="Recorded attendance summary">{counts.map(({ label, count }) => <div key={label}><dt className="notebook-heading text-sm">{label}</dt><dd className="mt-1 flex min-w-0 items-center gap-3"><span className="text-lg font-semibold tabular-nums">{count}</span><span className="notebook-tally"><Sketch seed={`${seed}:${label}`} kind="tally" count={count} /></span></dd></div>)}</dl>;
}

export function NotebookSentIcon() {
  const style = useNotebookStyle();
  return style === "notebook" ? <span className="notebook-sent"><Sketch seed="message-sent" kind="plane" /></span> : null;
}

export function NotebookLoading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p role="status" className={`flex items-center gap-2 ${className}`}><span className="notebook-completion"><Sketch seed="loading-checkbox" kind="box" /></span>{children}</p>;
}