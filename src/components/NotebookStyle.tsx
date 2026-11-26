import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_STYLE, resolveNotebookStyle, STYLE_STORAGE_KEY, type NotebookStyle } from "@/lib/notebook-style";
let current: NotebookStyle = DEFAULT_STYLE;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function apply(style: NotebookStyle) {
  current = style;
  document.documentElement.classList.toggle("style-notebook", style === "notebook");
  listeners.forEach((listener) => listener());
}
export function selectNotebookStyle(style: NotebookStyle) {
  try { localStorage.setItem(STYLE_STORAGE_KEY, style); } catch { /* Still works for this visit. */ }
  apply(style);
}
export function useNotebookStyle() {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_STYLE);
}
export function NotebookAppearance() {
  const style = useNotebookStyle();
  useEffect(() => {
    try { apply(resolveNotebookStyle(localStorage.getItem(STYLE_STORAGE_KEY))); } catch { apply(DEFAULT_STYLE); }
    const onStorage = (event: StorageEvent) => {
      if (event.key === STYLE_STORAGE_KEY || event.key === null) apply(resolveNotebookStyle(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (style !== "notebook") return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Recursive:CASL,wght@0..1,400..700&family=ZCOOL+KuaiLe&display=swap";
    document.head.appendChild(link);
    return () => link.remove();
  }, [style]);
  return null;
}