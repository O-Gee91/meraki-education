import { BookOpen, Download, PlayCircle } from "lucide-react";
import setupVideo from "@/assets/student-2fa-setup.mp4.asset.json";
import phoneVideo from "@/assets/student-2fa-phone-walkthrough.mp4.asset.json";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PDF = "/downloads/student-2fa-guide.pdf";

const phone = [
  ["Android or iPhone", "Microsoft Authenticator (微软身份验证器)", "Apple App Store, or Huawei, Xiaomi, OPPO, vivo or 应用宝 app stores."],
  ["iPhone or iPad", "Apple Passwords (built in)", "No download: Settings → Passwords. 设置 → 密码。"],
  ["No account wanted", "2FAS, Ente Auth, or Aegis (Android)", "App Store or the app's official website."],
];
const computer = [
  ["Safari (Mac)", "Apple Passwords (built in)", "Already on your Mac."],
  ["Microsoft Edge", "Authenticator extension", "Edge Add-ons store."],
  ["Firefox", "Authenticator extension", "addons.mozilla.org"],
  ["Chrome", "Bitwarden or KeePassXC desktop app", "The Chrome Web Store may not open in China. Download from bitwarden.com or keepassxc.org."],
  ["360, QQ or Sogou browser", "Authenticator extension", "Search 身份验证器 in the browser's extension store."],
];

function Rows({ rows }: { rows: string[][] }) {
  return (
    <ul className="space-y-2">
      {rows.map(([dev, tool, where]) => (
        <li key={dev} className="rounded-md border p-3 text-sm">
          <div className="text-xs text-muted-foreground">{dev}</div>
          <div className="font-medium">{tool}</div>
          <div className="text-muted-foreground">{where}</div>
        </li>
      ))}
    </ul>
  );
}

/** Student-facing help for choosing and connecting an authenticator. */
export function MfaSetupGuide() {
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm"><BookOpen aria-hidden="true" />Setup guide · 设置指引</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>How to set up two-step verification</DialogTitle>
            <DialogDescription>Pick one tool. None of these need a VPN. 以下工具均无需VPN。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-medium"><PlayCircle className="size-4" aria-hidden="true" />Watch how · 观看视频教程 (1 min)</h3>
            <video src={setupVideo.url} aria-label="Video: setting up 2FA on a computer. The same steps are written out under Computer browser below." controls preload="metadata" playsInline className="w-full rounded-md border bg-muted" />
            <a href={setupVideo.url} download="Meraki-2FA-Setup-Video.mp4" className="text-xs text-muted-foreground underline underline-offset-2">Download video · 下载视频</a>
          </div>
          <Tabs defaultValue="phone">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone">Phone or tablet</TabsTrigger>
              <TabsTrigger value="computer">Computer browser</TabsTrigger>
            </TabsList>
            <TabsContent value="phone" className="space-y-3">
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-sm font-medium"><PlayCircle className="size-4" aria-hidden="true" />On your phone · 手机操作演示 (30 sec)</h3>
                <video src={phoneVideo.url} aria-label="Video: adding Meraki to an authenticator app on a phone. The same steps are written out below." controls preload="metadata" playsInline className="mx-auto max-h-[60vh] rounded-md border bg-muted" />
                <a href={phoneVideo.url} download="Meraki-2FA-Phone-Walkthrough.mp4" className="block text-center text-xs text-muted-foreground underline underline-offset-2">Download phone video · 下载手机视频</a>
              </div>
              <Rows rows={phone} />
            </TabsContent>
            <TabsContent value="computer"><Rows rows={computer} /></TabsContent>
          </Tabs>
          <div className="space-y-3 text-sm">
            <p className="rounded-md bg-muted px-3 py-2">
              <span className="font-medium">Turn on automatic time</span> in your device's Date &amp; Time settings, or codes won't match. 请开启「自动设置时间」。
            </p>
            <div>
              <h3 className="font-medium">Then, in Meraki</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>Click <span className="text-foreground">Set up authenticator</span>.</li>
                <li>In your app, tap + / Add account and scan the square code. Can't scan? Copy the key under it.</li>
                <li>Type the 6 numbers your app shows. Meraki checks them automatically.</li>
                <li>Download or copy your backup codes and keep them safe. Each works once.</li>
              </ol>
            </div>
            <p className="text-muted-foreground">
              Lost your phone or codes? Ask your teacher to reset your two-step verification. 请联系老师重置。
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Button variant="ghost" size="sm" asChild>
        <a href={PDF} download="Meraki-2FA-Student-Guide.pdf"><Download aria-hidden="true" />Download PDF</a>
      </Button>
    </div>
  );
}
