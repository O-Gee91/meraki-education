import { useEffect } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { reportIntegrityViolation, type IntegrityReason } from "@/lib/integrity.functions";

const AUTOMATION_KEYS = [
  "__playwright",
  "__pw_manual",
  "__puppeteer_evaluation_script__",
  "_phantom",
  "callPhantom",
  "__nightmare",
  "__selenium_unwrapped",
  "__webdriver_evaluate",
  "__driver_evaluate",
  "domAutomation",
  "domAutomationController",
];

const SESSION_KEY = "meraki-integrity-reported";

function alreadyReported(reason: IntegrityReason) {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (seen.includes(reason)) return true;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...seen, reason]));
    return false;
  } catch {
    return false;
  }
}

/**
 * Students and guardians are not allowed to script, bot or run code against the
 * platform. This watches for automation signals in the browser and asks the
 * server to record a behavior strike when one is seen. Detection is
 * intentionally conservative: each signal reports at most once per session.
 */
export function useIntegrityGuard(enabled: boolean) {
  const report = useServerFn(reportIntegrityViolation);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let cancelled = false;

    const flag = async (reason: IntegrityReason, detail?: string) => {
      if (cancelled || alreadyReported(reason)) return;
      try {
        const result = await report({
          data: { reason, detail, path: window.location.pathname },
        });
        if (result.flagged) {
          toast.error(
            "Automation detected. Scripting or running code is not allowed — a behavior strike has been recorded and your teacher has been notified.",
            { duration: 12000 },
          );
        }
      } catch {
        // never break the app on a failed report
      }
    };

    // 1. Headless / driver-controlled browsers.
    if (navigator.webdriver) void flag("webdriver");

    // 2. Known automation frameworks injected into the page.
    const win = window as unknown as Record<string, unknown>;
    const hit =
      AUTOMATION_KEYS.find((k) => k in win) ??
      Object.keys(document).find((k) => k.startsWith("cdc_") || k.startsWith("$cdc_"));
    if (hit) void flag("automation_global", hit);

    // 3. Synthetic (script-generated) clicks and keystrokes.
    //    Whitelist: browser autofill (password managers, saved logins) fires
    //    untrusted change/input/keydown events on form fields. On the account
    //    settings page that is normal behaviour, not scripting, so those
    //    events are ignored instead of earning a strike.
    const AUTOFILL_SAFE_PATHS = ["/settings"];
    const isAutofillEvent = (event: Event) => {
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      if (!AUTOFILL_SAFE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return false;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      return tag === "input" || tag === "select" || tag === "textarea" || tag === "form";
    };

    let synthetic = 0;
    const onSynthetic = (event: Event) => {
      if (event.isTrusted) return;
      if (isAutofillEvent(event)) return;
      synthetic += 1;
      if (synthetic >= 3) void flag("synthetic_input", `${synthetic} untrusted events`);
    };
    for (const type of ["click", "keydown", "submit", "change"]) {
      document.addEventListener(type, onSynthetic, true);
    }


    // 4. Direct eval() from the console (the app bundle never calls eval).
    const originalEval = window.eval;
    try {
      window.eval = function patchedEval(this: unknown, source?: string) {
        void flag("console_execution", typeof source === "string" ? source.slice(0, 120) : undefined);
        return originalEval.call(this ?? window, source as string);
      } as typeof window.eval;
    } catch {
      // sealed environments may refuse the patch
    }

    return () => {
      cancelled = true;
      for (const type of ["click", "keydown", "submit", "change"]) {
        document.removeEventListener(type, onSynthetic, true);
      }
      try {
        window.eval = originalEval;
      } catch {
        /* ignore */
      }
    };
  }, [enabled, report]);
}
