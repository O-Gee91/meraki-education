import { Badge } from "@/components/ui/badge";

export type ProvisionedAccount = {
  student: string;
  role: "student" | "parent";
  email: string;
  password: string | null;
  status: "created" | "linked" | "failed";
  detail?: string;
};

export function AccountResults({ accounts }: { accounts: ProvisionedAccount[] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="p-2">Person</th>
            <th className="p-2">Email</th>
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
              <td className="p-2 text-muted-foreground">{a.email}</td>
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
