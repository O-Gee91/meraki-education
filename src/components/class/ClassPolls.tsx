import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export function ClassPolls({ classId, isStaff }: { classId: string; isStaff: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [share, setShare] = useState(true);

  const { data: polls = [] } = useQuery({
    queryKey: ["polls", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("polls")
        .select("id, question, options, share_results, closed, created_at")
        .eq("class_id", classId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const pollIds = polls.map((p) => p.id);
  const { data: votes = [] } = useQuery({
    queryKey: ["poll-votes", classId, pollIds.join(",")],
    enabled: pollIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poll_votes")
        .select("id, poll_id, user_id, option_index")
        .in("poll_id", pollIds);
      if (error) throw error;
      return data;
    },
  });

  const createPoll = useMutation({
    mutationFn: async () => {
      const q = question.trim();
      const opts = options.map((o) => o.trim()).filter(Boolean);
      if (q.length < 3) throw new Error("Add a question");
      if (opts.length < 2) throw new Error("Add at least two options");
      const { error } = await supabase.from("polls").insert({
        class_id: classId,
        question: q,
        options: opts,
        share_results: share,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setQuestion("");
      setOptions(["", ""]);
      toast.success("Poll published");
      queryClient.invalidateQueries({ queryKey: ["polls", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vote = useMutation({
    mutationFn: async (input: { pollId: string; index: number }) => {
      const { error } = await supabase.from("poll_votes").upsert(
        { poll_id: input.pollId, user_id: user!.id, option_index: input.index },
        { onConflict: "poll_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Answer recorded");
      queryClient.invalidateQueries({ queryKey: ["poll-votes", classId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleClosed = useMutation({
    mutationFn: async (poll: { id: string; closed: boolean }) => {
      const { error } = await supabase
        .from("polls")
        .update({ closed: !poll.closed })
        .eq("id", poll.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["polls", classId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-4 space-y-4">
      {isStaff && (
        <div className="panel p-5">
          <h3 className="text-sm font-semibold">New poll</h3>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="poll-q">Question</Label>
              <Input
                id="poll-q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="How confident do you feel about today's lesson?"
              />
            </div>
            {options.map((opt, i) => (
              <Input
                key={i}
                value={opt}
                onChange={(e) =>
                  setOptions(options.map((o, idx) => (idx === i ? e.target.value : o)))
                }
                placeholder={`Option ${i + 1}`}
              />
            ))}
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="outline" size="sm" onClick={() => setOptions([...options, ""])}>
                Add option
              </Button>
              <div className="flex items-center gap-2">
                <Switch id="share" checked={share} onCheckedChange={setShare} />
                <Label htmlFor="share" className="text-sm">
                  Share results with students
                </Label>
              </div>
              <Button
                size="sm"
                className="ml-auto"
                onClick={() => createPoll.mutate()}
                disabled={createPoll.isPending}
              >
                Publish poll
              </Button>
            </div>
          </div>
        </div>
      )}

      {polls.length === 0 ? (
        <p className="panel p-6 text-sm text-muted-foreground">No polls yet.</p>
      ) : (
        polls.map((poll) => {
          const pollVotes = votes.filter((v) => v.poll_id === poll.id);
          const myVote = pollVotes.find((v) => v.user_id === user?.id);
          const total = pollVotes.length;
          const showResults = isStaff || poll.share_results;
          return (
            <div key={poll.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">{poll.question}</h3>
                {isStaff && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleClosed.mutate({ id: poll.id, closed: poll.closed })}
                  >
                    {poll.closed ? "Reopen" : "Close"}
                  </Button>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {(poll.options ?? []).map((opt, i) => {
                  const count = pollVotes.filter((v) => v.option_index === i).length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  return (
                    <button
                      key={i}
                      disabled={poll.closed}
                      onClick={() => vote.mutate({ pollId: poll.id, index: i })}
                      className={
                        "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors " +
                        (myVote?.option_index === i
                          ? "border-accent bg-accent/10"
                          : "border-border hover:bg-secondary/60")
                      }
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span>{opt}</span>
                        {showResults ? (
                          <span className="text-xs text-muted-foreground">
                            {count} · {pct}%
                          </span>
                        ) : null}
                      </span>
                      {showResults && (
                        <span className="mt-2 block h-1.5 rounded-full bg-secondary">
                          <span
                            className="block h-1.5 rounded-full bg-accent"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <BarChart3 className="size-3.5" /> {total} responses
                {poll.closed ? " · closed" : ""}
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}
