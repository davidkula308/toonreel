import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: Layout,
});

function Layout() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);
  if (loading || !user) return <div className="p-10 text-muted-foreground">Loading…</div>;
  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-ink bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link to="/studio" className="font-display text-xl font-bold">Toon<span className="text-primary">Reel</span></Link>
          <nav className="flex gap-4 text-sm font-semibold">
            <Link to="/studio" activeProps={{ className: "text-primary" }}>My projects</Link>
            <Link to="/settings" activeProps={{ className: "text-primary" }}>Settings</Link>
          </nav>
          <button className="ml-auto text-sm text-muted-foreground" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8"><Outlet /></main>
    </div>
  );
}
