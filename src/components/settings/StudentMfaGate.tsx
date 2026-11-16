import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { TwoFactorCard } from "./TwoFactorCard";
import { MfaSetupGuide } from "./MfaSetupGuide";
import { PasskeysCard } from "./PasskeysCard";

/** Students must turn on an authenticator before using the app. */
export function StudentMfaGate({ enforce, children }: { enforce: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const [required, setRequired] = useState(false);
  const [warnOpen, setWarnOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);

  async function skip() {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { mfa_opt_out: true, mfa_opt_out_at: new Date().toISOString() } });
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your choice. Try again.");
      return;
    }
    qc.setQueryData(["mfa-gate-factor"], { has: true });
    setWarnOpen(false);
    setRequired(false);
    toast("Two-step verification is off. You can turn it on anytime in Settings.");
  }
  const { data, isLoading } = useQuery({
    queryKey: ["mfa-gate-factor"],
    enabled: enforce,
    queryFn: async () => {
      const [{ data }, { data: u }, { count }] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.getUser(),
        supabase.from("passkey_credentials").select("id", { count: "exact", head: true }),
      ]);
      const optedOut = u.user?.user_metadata?.["mfa_opt_out"] === true;
      return { has: optedOut || (count ?? 0) > 0 || !!data?.totp.some((f) => f.status === "verified") };
    },
  });
  useEffect(() => {
    if (enforce && data && !data.has) setRequired(true);
  }, [enforce, data]);

  if (!enforce) return <>{children}</>;
  if (isLoading) return null;
  if (!required) return <>{children}</>;
  return (
    <div className="mx-auto max-w-xl space-y-4 py-6">
      <div className="panel p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Set up two-step verification</h2>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Your school asks every student to protect their account with an authenticator app.
          It takes about two minutes. Once it's done, you can use Meraki as usual.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Quickest: on your own Mac, iPhone, iPad or Windows laptop, choose "Add this device" below to use your fingerprint or face. 最快：在自己的设备上点击“添加此设备”。</li>
          <li>Or get an authenticator: Microsoft Authenticator on a phone, Apple Passwords on iPhone/Mac, or an option for your computer browser.</li>
          <li>Scan the code and type the 6 numbers it shows.</li>
          <li>Save your backup codes somewhere safe. Lost your phone? Ask your teacher to reset it.</li>
        </ol>
        <div className="mt-4">
          <MfaSetupGuide />
        </div>
      </div>
      <PasskeysCard onAdded={() => {
          qc.setQueryData(["mfa-gate-factor"], { has: true });
          setRequired(false);
        }} />
      <p className="text-center text-xs text-muted-foreground">Or use an authenticator app · 或使用验证器应用</p>
      <TwoFactorCard suggest={false} onDone={() => {
          // Record the finished setup so the gate stays open after navigating.
          qc.setQueryData(["mfa-gate-factor"], { has: true });
          setRequired(false);
        }} />
      <div className="text-center">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setUnderstood(false); setWarnOpen(true); }}>
          I can't or don't want to use an authenticator · 暂不使用验证器
        </Button>
      </div>
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="size-5 text-warning" />
              Continue without two-step verification? · 不使用双重验证？
            </DialogTitle>
            <DialogDescription>Your account will be protected by your password only. 您的账号将只受密码保护。</DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 text-sm">
            <li><span className="font-medium">Someone could pretend to be you.</span> Anyone who learns your password can post, reply or send messages in your name, and it will be recorded as you.<br /><span className="text-muted-foreground">他人可能冒充您发帖或发消息，记录会显示为您本人。</span></li>
            <li><span className="font-medium">Your grades and private notes are less protected.</span> Feedback, grades and wellbeing check-ins are behind one password.<br /><span className="text-muted-foreground">成绩、反馈和心情记录只靠一个密码保护。</span></li>
            <li><span className="font-medium">You could be locked out.</span> If someone changes your password, you'll need a teacher to reset your account.<br /><span className="text-muted-foreground">如果密码被他人修改，需要老师帮您重置账号。</span></li>
            <li className="text-muted-foreground">Having trouble with codes? Delete the old Meraki entry in your app and scan the newest code. 验证码不对？请删除旧的 Meraki 条目并重新扫描最新二维码。</li>
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(v === true)} className="mt-0.5" />
            <span>I understand these risks and will keep my password private. 我了解这些风险，并会保管好密码。</span>
          </label>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" disabled={!understood || busy} onClick={skip}>Continue without it · 继续</Button>
            <Button onClick={() => setWarnOpen(false)}>Set up authenticator · 设置验证器</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
