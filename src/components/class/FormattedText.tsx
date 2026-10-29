import { useRef } from "react";
import { Bold, Italic, List, Type } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { parseFormatted, toggleLinePrefix, wrapSelection, type InlineToken } from "@/lib/discussion";

function Inline({ parts }: { parts: InlineToken[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? <strong key={i}>{p.text}</strong> : p.italic ? <em key={i}>{p.text}</em> : <span key={i}>{p.text}</span>,
      )}
    </>
  );
}

/** Renders the small formatting language safely (no HTML injection). */
export function FormattedText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseFormatted(text);
  return (
    <div className={`space-y-1 text-sm leading-relaxed ${className}`}>
      {blocks.map((b, i) =>
        b.kind === "large" ? (
          <p key={i} className="text-base font-semibold"><Inline parts={b.parts} /></p>
        ) : b.kind === "bullet" ? (
          <p key={i} className="flex gap-2 pl-1"><span aria-hidden>•</span><span><Inline parts={b.parts} /></span></p>
        ) : b.parts.length === 0 ? (
          <div key={i} className="h-2" />
        ) : (
          <p key={i} className="whitespace-pre-wrap"><Inline parts={b.parts} /></p>
        ),
      )}
    </div>
  );
}

/** Textarea with a compact, age-appropriate toolbar: larger text, bold, italic, bullet. */
export function FormattedEditor({
  value,
  onChange,
  rows = 4,
  placeholder,
  maxLength,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const apply = (fn: (el: HTMLTextAreaElement) => { value: string; s: number; e: number }) => {
    const el = ref.current;
    if (!el) return;
    const r = fn(el);
    onChange(r.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.s, r.e);
    });
  };
  const wrap = (m: string) =>
    apply((el) => {
      const r = wrapSelection(value, el.selectionStart, el.selectionEnd, m);
      return { value: r.value, s: r.cursorStart, e: r.cursorEnd };
    });
  const prefix = (p: string) =>
    apply((el) => {
      const r = toggleLinePrefix(value, el.selectionStart, p);
      return { value: r.value, s: r.cursor, e: r.cursor };
    });
  const btn = "inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="rounded-md border border-input focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center gap-0.5 border-b border-border px-1 py-0.5" role="toolbar" aria-label="Formatting">
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => prefix("# ")} title="Larger text" aria-label="Larger text"><Type className="size-4" /></button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("**")} title="Bold" aria-label="Bold"><Bold className="size-4" /></button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => wrap("*")} title="Italic" aria-label="Italic"><Italic className="size-4" /></button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => prefix("- ")} title="Bullet point" aria-label="Bullet point"><List className="size-4" /></button>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="border-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
