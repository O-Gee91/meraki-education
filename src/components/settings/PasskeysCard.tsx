import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { passkeyRegistrationOptions, verifyPasskeyRegistration } from "@/lib/passkey.functions";
import { passkeyErrorMessage, passkeysSupported } from "@/lib/passkey-browser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Lets a person add or remove passkeys (Touch ID, Face ID, Windows Hello) as their second step. */
export function PasskeysCard({ onAdded }: { onAdded?: () => void }) {
  const qc = useQueryClient();
  const optionsFn = useServerFn(passkeyRegistrationOptions);
  const verifyFn = useServerFn(verifyPasskeyRegistration);
  const [support, setSupport] = useState<{ supported: boolean; builtIn: boolean } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void passkeysSupported().then(setSupport);
  }, []);

  const { data: keys = [] } = useQuery({
    queryKey: ["passkeys"],
    queryFn: async () => {
      const { data } = await supabase
        .from("passkey_credentials")
        .select("id, device_name, created_at, last_used_at, backed_up")
        .order("created_at");
      return data ?? [];
    },
  });

  async function add() {
    setBusy(true);
    try {
      const { options } = await optionsFn();
      const response = await startRegistration({ optionsJSON: options as never });
      const res = await verifyFn({ data: { response: response as unknown as Record<string, unknown>, deviceName: name || undefined } });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Passkey added. 通行密钥已添加。");
      setName("");
      void qc.invalidateQueries({ queryKey: ["passkeys"] });
      onAdded?.();
    } catch (e) {
      toast.error(passkeyErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("passkey_credentials").delete().eq("id", id);
    if (error) toast.error("Couldn't remove it. Try again.");
    else void qc.invalidateQueries({ queryKey: ["passkeys"] });
  }

  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-2">
        <Fingerprint className="size-5 text-primary" aria-hidden="true" />
        <h2 className="text-lg font-semibold">Passkeys · 通行密钥</h2>
        {keys.length > 0 && <Badge variant="secondary">On</Badge>}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Use your fingerprint, face, or device PIN instead of typing a 6-digit code. Nothing to install.
        <br />用指纹、面容或设备密码代替6位验证码，无需安装应用。
      </p>

      {keys.length > 0 && (
        <ul className="mt-4 space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <div className="font-medium">{k.device_name}</div>
                <div className="text-xs text-muted-foreground">
                  Added {fmt(k.created_at)}
                  {k.last_used_at ? ` · Last used ${fmt(k.last_used_at)}` : ""}
                  {k.backed_up ? " · Synced" : ""}
                </div>
              </div>
              <Button variant="ghost" size="sm" aria-label={`Remove ${k.device_name}`} onClick={() => remove(k.id)}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {support && !support.supported ? (
        <p className="mt-4 text-sm text-muted-foreground">This browser doesn't support passkeys. Use the authenticator app instead. 此浏览器不支持通行密钥。</p>
      ) : (
        <div className="mt-4 space-y-3">
          {support && !support.builtIn && (
            <p className="text-sm text-muted-foreground">
              No fingerprint or face sensor found here. You can still use a phone (scan the QR code it shows) or a security key.
              <br />本设备没有指纹或面容识别，可以用手机扫码或安全密钥。
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="passkey-name" className="text-xs">Device name (optional)</Label>
              <Input id="passkey-name" className="h-9 w-56" maxLength={60} placeholder="e.g. My MacBook" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button onClick={add} disabled={busy || !support}>
              <Fingerprint aria-hidden="true" />
              {busy ? "Waiting for your device…" : "Add this device · 添加此设备"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Don't add a passkey on a shared school computer. 请勿在公用电脑上添加。</p>
        </div>
      )}
    </div>
  );
}
