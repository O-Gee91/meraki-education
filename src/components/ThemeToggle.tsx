import { useCallback, useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { selectNotebookStyle, useNotebookStyle } from "@/components/NotebookStyle";
import { resolveNotebookStyle } from "@/lib/notebook-style";

export const THEME_STORAGE_KEY = "meraki-theme";

export type Theme = "light" | "sand" | "midnight" | "noir";

export const THEMES: {
  id: Theme;
  label: string;
  hint: string;
  dark: boolean;
  swatch: [string, string, string];
}[] = [
  {
    id: "light",
    label: "Ocean Light",
    hint: "Bright, cool blues",
    dark: false,
    swatch: ["#f7fafc", "#1e3a5f", "#5cbdb9"],
  },
  {
    id: "sand",
    label: "Warm Sand",
    hint: "Soft, low-glare daylight",
    dark: false,
    swatch: ["#faf8f5", "#6b5744", "#c08a5a"],
  },
  {
    id: "midnight",
    label: "Midnight Blue",
    hint: "Calm dark, high contrast",
    dark: true,
    swatch: ["#111a2b", "#e8eef6", "#7fd8d2"],
  },
  {
    id: "noir",
    label: "Charcoal Noir",
    hint: "Neutral dark, warm accent",
    dark: true,
    swatch: ["#151515", "#f0eeea", "#e8975d"],
  },
];

const listeners = new Set<(theme: Theme) => void>();

function isTheme(value: string | null): value is Theme {
  return !!value && THEMES.some((t) => t.id === value);
}

function applyTheme(theme: Theme) {
  const meta = THEMES.find((t) => t.id === theme);
  if (!meta) return;
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  root.classList.toggle("dark", meta.dark);
  root.style.colorScheme = meta.dark ? "dark" : "light";
}

function readTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (isTheme(stored)) return stored;
  const attr = document.documentElement.dataset["theme"] ?? null;
  if (isTheme(attr)) return attr;
  return document.documentElement.classList.contains("dark") ? "midnight" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const initial = readTheme();
    setTheme(initial);
    applyTheme(initial);
    listeners.add(setTheme);
    return () => {
      listeners.delete(setTheme);
    };
  }, []);

  const select = useCallback((next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
    listeners.forEach((fn) => fn(next));
  }, []);

  return { theme, select };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, select } = useTheme();
  const style = useNotebookStyle();
  const active = THEMES.find((t) => t.id === theme);
  if (!active) return null;
  const styleLabel = style === "notebook" ? "Notebook" : "Standard";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={className}
          aria-label={`Color scheme: ${active.label}. Style: ${styleLabel}`}
          title={`Color scheme: ${active.label}. Style: ${styleLabel}`}
        >
          <Palette className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Color scheme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onSelect={() => select(option.id)}
            className="gap-3 py-2"
          >
            <span className="flex shrink-0 items-center gap-1">
              {option.swatch.map((color) => (
                <span
                  key={color}
                  className="size-3 rounded-full border border-border"
                  style={{ backgroundColor: color }}
                />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
            <Check
              className={cn("size-4 shrink-0", option.id === theme ? "opacity-100" : "opacity-0")}
            />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Style</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={style}
          onValueChange={(value) => selectNotebookStyle(resolveNotebookStyle(value))}
        >
          <DropdownMenuRadioItem value="normal" className="min-h-11">Standard</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="notebook" className="min-h-11">
            Notebook
            <span className="sr-only">Handwritten headings, paper, and marks across the site</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
