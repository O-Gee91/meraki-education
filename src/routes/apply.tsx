import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/apply")({
  head: () => ({
    meta: [
      { title: "Apply to Meridian Middle School" },
      {
        name: "description",
        content:
          "Submit an enrollment application for grades 6–8 at Meridian. Takes about two minutes.",
      },
      { property: "og:title", content: "Apply to Meridian Middle School" },
      {
        property: "og:description",
        content:
          "Submit an enrollment application for grades 6–8 at Meridian. Takes about two minutes.",
      },
    ],
  }),
  component: ApplyPage,
});

const schema = z.object({
  student_name: z.string().trim().min(2, "Student name is required").max(120),
  grade_level: z.coerce.number().int().min(1, "Grade must be 1–12").max(12, "Grade must be 1–12"),
  guardian_name: z.string().trim().min(2, "Guardian name is required").max(120),
  guardian_email: z.string().trim().email("Enter a valid email").max(255),
  phone: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(1000).optional(),
});

function ApplyPage() {
  const [form, setForm] = useState({
    student_name: "",
    grade_level: "7",
    guardian_name: "",
    guardian_email: "",
    phone: "",
    notes: "",
  });
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = schema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      const { error } = await supabase.from("applications").insert({
        student_name: parsed.data.student_name,
        grade_level: parsed.data.grade_level,
        guardian_name: parsed.data.guardian_name,
        guardian_email: parsed.data.guardian_email,
        phone: parsed.data.phone || null,
        notes: parsed.data.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => setDone(true),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Back to Meridian
        </Link>
        <h1 className="mt-6 font-display text-4xl font-semibold">Enrollment application</h1>
        <p className="mt-2 text-muted-foreground">
          For grades 6–8. The admissions office replies within three school days.
        </p>

        {done ? (
          <div className="panel mt-8 p-8 text-center">
            <h2 className="text-xl font-semibold">Application received</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              We emailed a confirmation to {form.guardian_email}. Admissions will follow up shortly.
            </p>
            <Button asChild className="mt-6">
              <Link to="/">Return home</Link>
            </Button>
          </div>
        ) : (
          <form
            className="panel mt-8 space-y-4 p-6"
            onSubmit={(e) => {
              e.preventDefault();
              submit.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="student_name">Student full name</Label>
                <Input
                  id="student_name"
                  value={form.student_name}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="grade_level">Entering grade</Label>
                <Input
                  id="grade_level"
                  inputMode="numeric"
                  value={form.grade_level}
                  onChange={(e) => setForm({ ...form, grade_level: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian_name">Guardian name</Label>
                <Input
                  id="guardian_name"
                  value={form.guardian_name}
                  maxLength={120}
                  onChange={(e) => setForm({ ...form, guardian_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardian_email">Guardian email</Label>
                <Input
                  id="guardian_email"
                  type="email"
                  value={form.guardian_email}
                  maxLength={255}
                  onChange={(e) => setForm({ ...form, guardian_email: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  maxLength={30}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="notes">Anything we should know? (optional)</Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={form.notes}
                  maxLength={1000}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Submit application"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
