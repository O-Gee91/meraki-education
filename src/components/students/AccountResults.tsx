import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildDocument,
  docHeader,
  downloadHtml,
  escapeHtml,
  printHtml,
} from "@/lib/print-doc";

export type ProvisionedAccount = {
  student: string;
  role: "student" | "parent";
  username: string | null;
  email: string;
  password: string | null;
  status: "created" | "linked" | "failed";
  detail?: string;
};

export const MERAKI_INTRO = `<div class="box" style="background:#f2f8fa; border-color:#9fc6cf;">
  <h2 style="margin-top:0;">Welcome to Meraki Education</h2>
  <p><em>Meraki</em> is a Greek word — doing something with soul, creativity and love. That is how we
  approach school, and this platform is where it all comes together.</p>
  <p>With your account you can check grades and feedback, see upcoming assignments and due dates,
  follow the school calendar, submit work online, join class discussions, and message teachers.
  Parents and guardians use their own account to follow along.</p>
  <p class="muted" style="margin-bottom:0;">Your sign-in details are below. Keep them private and change the
  temporary password the first time you sign in.</p>
</div>`;

function realEmail(email: string) {
  return email && !email.endsWith("@meraki.local") ? email : null;
}

/** Address printed on every slip so families know where to sign in. */
export const SITE_URL = "https://meraki-education.lovable.app";

function buildSlips(accounts: ProvisionedAccount[]) {
  const usable = accounts.filter((a) => a.status !== "failed");
  const slips = usable
    .map(
      (a, i) => `<section style="page-break-inside: avoid; ${
        i < usable.length - 1 ? "page-break-after: always;" : ""
      }">
  ${docHeader(
    a.role === "student" ? "Student sign-in details" : "Parent / guardian sign-in details",
    [
      new Date().toLocaleDateString("en-US"),
      escapeHtml(a.student),
      "Confidential — hand directly to the recipient",
    ],
  )}
  ${MERAKI_INTRO}
  <div class="box" style="margin-bottom:16px;">
  <h2 style="margin:0 0 6px;">${escapeHtml(a.student)} — ${a.role === "student" ? "Student account" : "Parent / guardian account"}</h2>
  <table>
    <tr><th style="width:38%">Website</th><td><strong>${escapeHtml(SITE_URL)}</strong></td></tr>
    <tr><th>Sign in with</th><td>${escapeHtml(a.username ?? a.email)}</td></tr>
    <tr><th>Temporary password</th><td>${escapeHtml(a.password ?? "unchanged — use existing password")}</td></tr>
    <tr><th>Email on file</th><td>${escapeHtml(realEmail(a.email) ?? "—  add your own email at first sign-in to receive notifications")}</td></tr>
  </table>
  <p class="muted" style="margin:6px 0 0;">Go to <strong>${escapeHtml(SITE_URL)}</strong> to sign in, change this password right away, and register your email address so notifications reach you. Keep this slip private.</p>
  </div>
</section>`,
    )
    .join("");
  return buildDocument(
    "Account details",
    slips || '<p class="muted">No accounts to print.</p>',
  );
}

export function AccountResults({ accounts }: { accounts: ProvisionedAccount[] }) {
  const printable = accounts.filter((a) => a.status !== "failed").length;
  return (
    <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Print the slips below and hand them out — temporary passwords are only shown once. Each slip
        lists the sign-in address <span className="font-mono">{SITE_URL}</span>.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={printable === 0}
          onClick={() => printHtml(buildSlips(accounts))}
        >
          Print slips
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={printable === 0}
          onClick={() => downloadHtml(buildSlips(accounts), "meraki-account-details")}
        >
          Download
        </Button>
      </div>
    </div>
    <div className="max-h-64 overflow-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-2">Person</th>
            <th className="p-2">Sign in with</th>
            <th className="p-2">Temporary password</th>
            <th className="p-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {accounts.map((a) => (
            <tr key={`${a.email}-${a.role}`}>
              <td className="p-2">
                <span className="font-medium">{a.student}</span>
                <span className="ml-2 text-xs uppercase text-muted-foreground">{a.role}</span>
              </td>
              <td className="p-2 font-mono text-xs text-muted-foreground">
                {a.username ?? a.email}
              </td>
              <td className="p-2 font-mono text-xs">{a.password ?? "—"}</td>
              <td className="p-2">
                <Badge variant={a.status === "failed" ? "secondary" : "default"}>
                  {a.status === "failed" ? (a.detail ?? "failed") : a.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}
