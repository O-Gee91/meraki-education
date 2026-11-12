import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { backupCodesRemaining, clearMyMfaCodes, regenerateBackupCodes } from "@/lib/mfa.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type Step = "closed" | "scan" | "codes" | "disable";

function CodeInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <InputOTP maxLength={6} value={value} onChange={onChange} disabled={disabled} aria-label="6-digit code">
      <InputOTPGroup>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <InputOTPSlot key={i} index={i} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

export function TwoFactorCard({ suggest, onDone }: { suggest: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const regenFn = useServerFn(regenerateBackupCodes);
  const remainingFn = useServerFn(backupCodesRemaining);
  const clearFn = useServerFn(clearMyMfaCodes);

  const { data: factor, isLoading } = useQuery({
    queryKey: ["mfa-factor"],
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return data?.totp.find((f) => f.status === "verified") ?? null;
    },
  });
  const { data: remaining } = useQuery({
    queryKey: ["mfa-backup-remaining"],
    enabled: !!factor,
    queryFn: async () => (await remainingFn()).remaining,
  });

  const [step, setStep] = useState<Step>("closed");
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["mfa-factor"] });
    void qc.invalidateQueries({ queryKey: ["mfa-backup-remaining"] });
  }

  async function startSetup() {
    setBusy(true);
    // Clear any half-finished setup from before.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      issuer: "Meraki Education",
    });
    setBusy(false);
    if (error || !data) {
      toast.error("Couldn't start setup. Try again.");
      return;
    }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode("");
    setStep("scan");
  }

  async function confirmSetup(value: string) {
    if (!enroll) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: value });
    if (error) {
      setBusy(false);
      setCode("");
      toast.error("That code didn't match. Delete any old Meraki entry in your app, scan this newest code, and check your device time is set to automatic.");
      return;
    }
    try {
      const res = await regenFn();
      setCodes(res.codes);
      setSaved(false);
      setStep("codes");
      refresh();
    } catch {
      toast.error("Authenticator is on, but backup codes couldn't be created. Use “New backup codes”.");
      setStep("closed");
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function newCodes() {
    setBusy(true);
    try {
      const res = await regenFn();
      setCodes(res.codes);
      setSaved(false);
      setStep("codes");
      refresh();
    } catch {
      toast.error("Please sign out and back in with your authenticator first.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(value: string) {
    if (!factor) return;
    setBusy(true);
    const v = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value });
    if (v.error) {
      setBusy(false);
      setCode("");
      toast.error("That code didn't match.");
      return;
    }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (!error) await clearFn();
    await supabase.auth.refreshSession();
    setBusy(false);
    if (error) {
      toast.error("Couldn't turn off two-step verification.");
      return;
    }
    toast.success("Two-step verification is off.");
    setStep("closed");
    refresh();
  }

  const text = codes.join("\n");

  return (
    <section aria-labelledby="two-step" className="w-full min-w-0 max-w-lg space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="two-step" className="text-lg font-semibold">Two-step verification</h2>
        {!isLoading && (factor ? <Badge variant="secondary">On</Badge> : <Badge variant="outline">Off</Badge>)}
      </div>
      {factor ? (
        <>
          <p className="text-sm text-muted-foreground">
            You'll enter a code from your authenticator app each time you sign in. Set up on{" "}
            {new Date(factor.created_at).toLocaleDateString()}.
            {typeof remaining === "number" && ` ${remaining} of 8 backup codes left.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={newCodes} disabled={busy}>New backup codes</Button>
            <Button variant="ghost" onClick={() => { setCode(""); setStep("disable"); }}>Turn off</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Add a second step when you sign in: a 6-digit code from an authenticator, such as
            Microsoft Authenticator, Apple Passwords, or a browser extension on your computer.
          </p>
          {suggest && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Recommended for staff, because your account can see student information.
            </p>
          )}
          <Button onClick={startSetup} disabled={busy || isLoading}>
            <ShieldCheck aria-hidden="true" />
            Set up authenticator
          </Button>
        </>
      )}

      <Dialog
        open={step !== "closed"}
        onOpenChange={(o) => {
          if (!o && step === "codes" && !saved) return;
          if (!o) setStep("closed");
        }}
      >
        <DialogContent>
          {step === "scan" && enroll && (
            <>
              <DialogHeader>
                <DialogTitle>Step 1 of 2 · Scan this code</DialogTitle>
                <DialogDescription>
                  In your authenticator app, add an account and scan the square below. Then type the
                  6-digit code it shows.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3">
                <img src={enroll.qr} alt="QR code for your authenticator app" className="size-44 rounded-md bg-card p-2" />
                <p className="text-center text-xs text-muted-foreground">
                  Can't scan? Enter this key instead:
                  <br />
                  <span className="font-mono text-sm text-foreground [overflow-wrap:anywhere]">{enroll.secret}</span>
                </p>
                <CodeInput value={code} disabled={busy} onChange={(v) => { setCode(v); if (v.length === 6) void confirmSetup(v); }} />
              </div>
            </>
          )}
          {step === "codes" && (
            <>
              <DialogHeader>
                <DialogTitle>Step 2 of 2 · Save your backup codes</DialogTitle>
                <DialogDescription>
                  If you lose your phone, each of these codes lets you sign in once. Keep them somewhere
                  safe — you won't see them again.
                </DialogDescription>
              </DialogHeader>
              <ul className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
                {codes.map((c) => <li key={c}>{c}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(text); toast.success("Copied"); }}>
                  <Copy aria-hidden="true" /> Copy all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(new Blob([`Meraki Education backup codes\n\n${text}\n`], { type: "text/plain" }));
                    a.download = "meraki-backup-codes.txt";
                    a.click();
                  }}
                >
                  <Download aria-hidden="true" /> Download .txt
                </Button>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
                I saved these codes
              </label>
              <DialogFooter>
                <Button disabled={!saved} onClick={() => { setStep("closed"); toast.success("Two-step verification is on."); onDone?.(); }}>
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
          {step === "disable" && (
            <>
              <DialogHeader>
                <DialogTitle>Turn off two-step verification?</DialogTitle>
                <DialogDescription>
                  Enter the current code from your authenticator app to confirm. Your backup codes will
                  stop working.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-center">
                <CodeInput value={code} disabled={busy} onChange={(v) => { setCode(v); if (v.length === 6) void disable(v); }} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
