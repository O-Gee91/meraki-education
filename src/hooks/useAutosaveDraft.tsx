import { useEffect, useRef, useState } from "react";
import { CloudOff, Loader2, Save } from "lucide-react";

const PREFIX = "meraki-draft:";

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export type DraftState = "idle" | "saving" | "saved";

/**
 * Autosaves in-progress work to the browser so nothing is lost on refresh,
 * and warns the user before they leave with unsaved changes.
 */
export function useAutosaveDraft<T>(
  key: string,
  value: T,
  options?: { enabled?: boolean; dirty?: boolean; delay?: number },
) {
  const enabled = options?.enabled ?? true;
  const delay = options?.delay ?? 700;
  const dirty = options?.dirty ?? false;
  const [state, setState] = useState<DraftState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const first = useRef(true);
  const latestKey = useRef(key);
  const latestValue = useRef(value);
  const latestDirty = useRef(dirty);
  const cleared = useRef(false);
  latestKey.current = key;
  latestValue.current = value;
  latestDirty.current = dirty;

  useEffect(() => {
    cleared.current = false;
  }, [value]);

  // A quick close can happen before the debounce finishes. Flush the latest
  // value on unmount so changing students or closing a grading view cannot
  // discard the last few keystrokes.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      if (latestKey.current !== key || !latestDirty.current || cleared.current) return;
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(latestValue.current));
      } catch {
        /* ignore */
      }
    };
  }, [key, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setState("saving");
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
        setSavedAt(new Date());
        setState("saved");
      } catch {
        setState("idle");
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [key, value, enabled, delay]);

  // Reminder: browser confirm dialog when leaving with work not yet submitted.
  useEffect(() => {
    if (!enabled || !dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled, dirty]);

  const clear = () => {
    cleared.current = true;
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
    setState("idle");
    setSavedAt(null);
  };

  return { state, savedAt, clear, restore: () => read<T>(key) };
}

export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  return read<T>(key);
}

export function DraftStatus({
  state,
  savedAt,
  dirty,
  className,
}: {
  state: DraftState;
  savedAt: Date | null;
  dirty?: boolean;
  className?: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => tick((n) => n + 1), 15000);
    return () => window.clearInterval(i);
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ""}`}
      aria-live="polite"
    >
      {state === "saving" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Autosaving…
        </>
      ) : state === "saved" && savedAt ? (
        <>
          <Save className="h-3 w-3" /> Draft autosaved{" "}
          {savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </>
      ) : dirty ? (
        <>
          <CloudOff className="h-3 w-3" /> Not turned in yet
        </>
      ) : (
        <>
          <Save className="h-3 w-3" /> Autosave on
        </>
      )}
    </span>
  );
}
