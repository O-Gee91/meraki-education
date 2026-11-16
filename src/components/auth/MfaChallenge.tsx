import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { passkeyAuthOptions, passkeyStatus, verifyPasskeyAuth } from "@/lib/passkey.functions";
import { passkeyErrorMessage } from "@/lib/passkey-browser";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { verifiedTotpFactor } from "@/lib/mfa-client";
import { recoverWithBackupCode, recoverWithEmailCode, sendMfaEmailCode } from "@/lib/mfa.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

type Mode = "loading" | "passkey" | "totp" | "backup" | "email";

export function MfaChallenge({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [hasPasskey, setHasPasskey] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  const statusFn = useServerFn(passkeyStatus);
  const pkOptionsFn = useServerFn(passkeyAuthOptions);
  const pkVerifyFn = useServerFn(verifyPasskeyAuth);

  useEffect(() => {
    void Promise.all([statusFn().catch(() => ({ has: false, verified: false })), verifiedTotpFactor()]).then(([pk, totp]) => {
      setHasPasskey(pk.has);
      setHasTotp(!!totp);
      setMode(pk.has ? "passkey" : "totp");
    });
  }, [statusFn]);

  async function usePasskey() {
    setBusy(true);
    try {
      const { options } = await pkOptionsFn();
      const response = await startAuthentication({ optionsJSON: options as never });
      const res = await pkVerifyFn({ data: { response: response as unknown as Record<string, unknown> } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      onDone();
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const backupFn = useServerFn(recoverWithBackupCode);
  const emailFn = useServerFn(recoverWithEmailCode);
  const sendFn = useServerFn(sendMfaEmailCode);

  async function afterRecovery() {
    await supabase.auth.refreshSession();
    toast.success("Signed in. Please set up your authenticator again in Account settings.");
    onDone();
  }

  async function verifyTotp(value: string) {
    setBusy(true);
    const factor = await verifiedTotpFactor();
    if (!factor) {
      setBusy(false);
      onDone();
      return;
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: value });
    setBusy(false);
    if (error) {
      toast.error("That code didn't match. Check your app and try again.");
      setCode("");
      return;
    }
    onDone();
  }

  async function submitRecovery(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res =
        mode === "backup"
          ? await backupFn({ data: { code } })
          : await emailFn({ data: { code: code.trim() } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      await afterRecovery();
    } catch {
      toast.error("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendEmail() {
    setBusy(true);
    try {
      const res = await sendFn();
      if (!res.ok) toast.error(res.message);
      else setEmailSentTo(res.sentTo);
    } finally {
      setBusy(false);
    }
  }

  function switchTo(m: Mode) {
    void hasPasskey;
    setMode(m);
    setCode("");
    if (m === "email" && !emailSentTo) void sendEmail();
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
        <h2 className="text-xl font-semibold tracking-normal">Two-step verification</h2>
      </div>

      {mode === "loading" ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking your sign-in options…</p>
      ) : mode === "passkey" ? (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Confirm it's you with this device's fingerprint, face, or screen-lock PIN.
            <br />请用本设备的指纹、面容或锁屏密码确认身份。
          </p>
          <Button type="button" onClick={usePasskey} disabled={busy} autoFocus>
            <Fingerprint aria-hidden="true" />
            {busy ? "Waiting for your device…" : "Verify with Touch ID / Face ID / Windows Hello"}
          </Button>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">On a different device?</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {hasTotp && (
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => switchTo("totp")}>
                  Use a 6-digit authenticator code
                </button>
              )}
              <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => switchTo("backup")}>
                Use a backup code
              </button>
              <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => switchTo("email")}>
                Email me a code
              </button>
            </div>
          </div>
        </div>
      ) : mode === "totp" ? (
        <div className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            Open your authenticator app and enter the 6-digit code for Meraki Education.
          </p>
          <InputOTP
            maxLength={6}
            value={code}
            onChange={(v) => {
              setCode(v);
              if (v.length === 6) void verifyTotp(v);
            }}
            disabled={busy}
            autoFocus
            aria-label="6-digit code"
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">Can't use your authenticator?</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => switchTo("backup")}>
                Use a backup code
              </button>
              <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => switchTo("email")}>
                Email me a code
              </button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submitRecovery} className="mt-4 space-y-5">
          <p className="text-sm text-muted-foreground">
            {mode === "backup"
              ? "Enter one of the backup codes you saved when you set up two-step verification. Each code works once."
              : emailSentTo
                ? `We sent a 6-digit code to ${emailSentTo}. It expires in 10 minutes.`
                : "Sending a code to your email…"}
          </p>
          <div className="space-y-2">
            <Label htmlFor="mfa-recovery">{mode === "backup" ? "Backup code" : "Email code"}</Label>
            <Input
              id="mfa-recovery"
              className="h-11 bg-card font-mono tracking-widest"
              value={code}
              maxLength={mode === "backup" ? 12 : 6}
              placeholder={mode === "backup" ? "XXXX-XXXX" : "000000"}
              autoComplete="one-time-code"
              onChange={(e) => setCode(e.target.value)}
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Using this will turn off two-step verification so you can set up your authenticator again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.trim().length < 6}>
              {busy ? "Checking…" : "Continue"}
            </Button>
            {mode === "email" && (
              <Button type="button" variant="outline" disabled={busy} onClick={sendEmail}>
                Send a new code
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => switchTo(hasPasskey ? "passkey" : "totp")}>
              Back
            </Button>
          </div>
        </form>
      )}

      <div className="mt-6 border-t border-border pt-4">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel and return to sign in
        </Button>
      </div>
    </div>
  );
}
