import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => ({ meta: [{ title: "My videos — ToonReel" }, { name: "description", content: "Your cartoon video projects." }] }),
  component: Studio,
});

function Studio() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id,title,style,scenes,updated_at").order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const create = async () => {
    const { data, error } = await supabase.from("projects").insert({ user_id: user!.id }).select("id").single();
    if (error) return toast.error(error.message);
    nav({ to: "/project/$id", params: { id: data.id } });
  };

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <h1 className="text-4xl font-bold">My videos</h1>
        <Button onClick={create} className="rounded-full border-2 border-ink shadow-pop-sm">+ New video</Button>
      </div>
      {isLoading ? <p className="text-muted-foreground">Loading…</p> : projects.length === 0 ? (
        <div className="card-pop p-10 text-center">
          <p className="font-display text-2xl">No videos yet</p>
          <p className="mt-2 text-muted-foreground">Start with a description and a script — any format works.</p>
          <Button onClick={create} className="mt-6 rounded-full border-2 border-ink">Create your first video</Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {projects.map((p) => {
            const scenes = (p.scenes as any[]) ?? [];
            const done = scenes.filter((s) => s.status === "done").length;
            return (
              <Link key={p.id} to="/project/$id" params={{ id: p.id }} className="card-pop block p-5 transition-transform hover:-translate-y-1">
                <h3 className="text-xl font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.style} · {done}/{scenes.length} scenes made</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
