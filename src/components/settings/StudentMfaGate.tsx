import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TwoFactorCard } from "./TwoFactorCard";
import { MfaSetupGuide } from "./MfaSetupGuide";

/** Students must turn on an authenticator before using the app. */
export function StudentMfaGate({ enforce, children }: { enforce: boolean; children: ReactNode }) {
  const [required, setRequired] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["mfa-gate-factor"],
    enabled: enforce,
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return { has: !!data?.totp.some((f) => f.status === "verified") };
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
          <li>Get an authenticator: Microsoft Authenticator on a phone, Apple Passwords on iPhone/Mac, or an option for your computer browser.</li>
          <li>Scan the code and type the 6 numbers it shows.</li>
          <li>Save your backup codes somewhere safe. Lost your phone? Ask your teacher to reset it.</li>
        </ol>
        <div className="mt-4">
          <MfaSetupGuide />
        </div>
      </div>
      <TwoFactorCard suggest={false} onDone={() => setRequired(false)} />
    </div>
  );
}
