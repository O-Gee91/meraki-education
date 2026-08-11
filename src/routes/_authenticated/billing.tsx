import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, formatDate } from "@/lib/school";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing — Meridian" },
      { name: "description", content: "School fees, lunch balances and invoice status." },
      { property: "og:title", content: "Billing — Meridian" },
      { property: "og:description", content: "School fees, lunch balances and invoice status." },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const { isStaff, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ studentId: "", description: "", amount: "", due: "" });

  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, description, amount_cents, status, due_date, students(first_name, last_name)")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: students = [] } = useQuery({
    queryKey: ["students"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.studentId) throw new Error("Pick a student");
      if (form.description.trim().length < 3) throw new Error("Describe the charge");
      const amount = Number(form.amount);
      if (Number.isNaN(amount) || amount <= 0 || amount > 100000)
        throw new Error("Enter a valid amount");
      const { error } = await supabase.from("invoices").insert({
        student_id: form.studentId,
        description: form.description.trim().slice(0, 140),
        amount_cents: Math.round(amount * 100),
        due_date: form.due || null,
        status: "unpaid",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice created");
      setOpen(false);
      setForm({ studentId: "", description: "", amount: "", due: "" });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("invoices").update({ status: "paid" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marked as paid");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + Number(i.amount_cents), 0);

  return (
    <AppShell
      title="Billing"
      description="Fees and lunch charges, with balances visible to guardians."
      actions={
        isAdmin ? (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>New invoice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New invoice</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="student">Student</Label>
                  <Select
                    value={form.studentId}
                    onValueChange={(v) => setForm({ ...form, studentId: v })}
                  >
                    <SelectTrigger id="student">
                      <SelectValue placeholder="Choose a student" />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.last_name}, {s.first_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={form.description}
                    maxLength={140}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount (USD)</Label>
                    <Input
                      id="amount"
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="due">Due date</Label>
                    <Input
                      id="due"
                      type="date"
                      value={form.due}
                      onChange={(e) => setForm({ ...form, due: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Create invoice"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null
      }
    >
      <div className="panel p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Outstanding balance
        </p>
        <p className="mt-2 text-3xl font-semibold">{formatCurrency(outstanding)}</p>
      </div>

      <div className="panel mt-6 divide-y divide-border">
        {invoices.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No invoices on file.</p>
        ) : (
          invoices.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-medium">{i.description}</p>
                <p className="text-xs text-muted-foreground">
                  {i.students?.last_name}, {i.students?.first_name} · due {formatDate(i.due_date)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{formatCurrency(Number(i.amount_cents))}</span>
                <Badge variant={i.status === "paid" ? "default" : "secondary"}>{i.status}</Badge>
                {isStaff && i.status !== "paid" && (
                  <Button size="sm" variant="outline" onClick={() => markPaid.mutate(i.id)}>
                    Mark paid
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
