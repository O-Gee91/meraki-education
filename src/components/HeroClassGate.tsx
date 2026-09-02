import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { StudentHero } from "@/components/StudentHero";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Blocking first-login step for students: a character class must be chosen
 * before the rest of the platform becomes usable. StudentHero renders the
 * chooser itself while no class is stored.
 */
export function HeroClassGate() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["hero-profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_profiles")
        .select("hero_class, quest_started_at, class_changes")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading || data?.hero_class) return null;

  return (
    <Dialog open>
      <DialogContent
        className="max-h-[90vh] max-w-4xl overflow-y-auto [&>button]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Choose your character class</DialogTitle>
          <DialogDescription>
            Before you begin, pick the hero you will play as this year. You can change your class
            up to 3 times afterwards.
          </DialogDescription>
        </DialogHeader>
        <StudentHero />
      </DialogContent>
    </Dialog>
  );
}
