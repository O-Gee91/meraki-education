export type NotebookStyle = "normal" | "notebook";
export const STYLE_STORAGE_KEY = "meraki-style";
export const DEFAULT_STYLE: NotebookStyle = "normal";
export function resolveNotebookStyle(value: string | null): NotebookStyle {
  return value === "notebook" ? "notebook" : DEFAULT_STYLE;
}