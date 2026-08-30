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

function buildSlips(accounts: ProvisionedAccount[]) {
  const usable = accounts.filter((a) => a.status !== "failed");
  const slips = usable
    .map(
      (a) => `<div class="box" style="page-break-inside: avoid; margin-bottom:16px;">
  <h2 style="margin:0 0 6px;">${escapeHtml(a.student)} — ${a.role === "student" ? "Student account" : "Parent / guardian account"}</h2>
  <table>
    <tr><th style="width:38%">Sign in with</th><td>${escapeHtml(a.username ?? a.email)}</td></tr>
    <tr><th>Temporary password</th><td>${escapeHtml(a.password ?? "unchanged — use existing password")}</td></tr>
    <tr><th>Email on file</th><td>${escapeHtml(a.email)}</td></tr>
  </table>
  <p class="muted" style="margin:6px 0 0;">Sign in at the Meraki Education site, then change this password right away. Keep this slip private.</p>
</div>`,
    )
    .join("");
  return buildDocument(
    "Account details",
    `${docHeader("Student & guardian sign-in details", [
      new Date().toLocaleDateString("en-US"),
      `${usable.length} account${usable.length === 1 ? "" : "s"}`,
      "Confidential — hand directly to the recipient",
    ])}${slips || '<p class="muted">No accounts to print.</p>'}`,
  );
}

export function AccountResults({ accounts }: { accounts: ProvisionedAccount[] }) {
  const printable = accounts.filter((a) => a.status !== "failed").length;
  return (
    <div className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Print the slips below and hand them out — temporary passwords are only shown once.
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
  );
}
