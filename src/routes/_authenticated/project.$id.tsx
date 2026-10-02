import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ChannelIntro } from "@/components/ChannelIntro";
import { signedUrl, useAuth } from "@/lib/use-auth";
import { analyzeScript, editScene, startClip, checkClip } from "@/lib/studio.functions";
import { PALETTES, STYLES, type Scene, type Suggestion } from "@/lib/studio-types";

export const Route = createFileRoute("/_authenticated/project/$id")({
  head: () => ({ meta: [{ title: "Video editor — ToonReel" }, { name: "description", content: "Write, style and generate your cartoon video." }] }),
  component: Editor,
});

function Editor() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const key = ["project", id];
  const { data: project } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("user_settings").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });

  const [form, setForm] = useState({ description: "", script: "", style: "cartoon", palette: "sunny", aspect: "16:9" });
  useEffect(() => {
    if (project) setForm({ description: project.description, script: project.script, style: project.style, palette: project.palette, aspect: project.aspect });
  }, [project?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyze = useServerFn(analyzeScript);
  const edit = useServerFn(editScene);
  const start = useServerFn(startClip);
  const check = useServerFn(checkClip);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const scenes = (project?.scenes as Scene[] | undefined) ?? [];
  const suggestions = (project?.suggestions as Suggestion[] | undefined) ?? [];

  // Poll generating scenes
  const generating = scenes.filter((s) => s.status === "generating").map((s) => s.id).join(",");
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(async () => {
      for (const sid of generating.split(",")) {
        try {
          const r = await check({ data: { projectId: id, sceneId: sid } });
          if (r.status === "failed") toast.error(`Scene failed: ${r.error ?? ""}`);
          if (r.status !== "generating") refresh();
        } catch (e) {
          toast.error((e as Error).message);
        }
      }
    }, 8000);
    return () => clearInterval(t);
  }, [generating, id, check, refresh]);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveAndAnalyze = () =>
    run("analyze", async () => {
      if (!form.script.trim()) throw new Error("Add a script first");
      const { error } = await supabase.from("projects").update(form).eq("id", id);
      if (error) throw error;
      await analyze({ data: { projectId: id } });
      toast.success("Scenes ready! Review them, then make the clips.");
    });

  const makeAll = () =>
    run("all", async () => {
      for (const s of scenes.filter((x) => x.status !== "done" && x.status !== "generating")) {
        await start({ data: { projectId: id, sceneId: s.id } });
      }
    });

  if (!project) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-10">
      <h1 className="text-4xl font-bold">{project.title}</h1>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card-pop space-y-4 p-6">
          <h2 className="text-2xl font-semibold">1. Your story</h2>
          <div><Label>What's the video about?</Label>
            <Input placeholder="Benny the Bunny finds a glowing egg — 45s kids' episode" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><Label>Script (any format)</Label>
            <Textarea rows={12} placeholder={'[0–3s] Benny: "Whoa! What\'s that glowing under the tree?"\n[3–10s] He digs and discovers a magical blue egg…'} value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} /></div>
        </div>
        <div className="card-pop space-y-5 p-6">
          <h2 className="text-2xl font-semibold">2. Character look</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {STYLES.map((s) => (
              <button key={s.id} onClick={() => setForm({ ...form, style: s.id })}
                className={`rounded-xl border-2 p-3 text-left transition ${form.style === s.id ? "border-ink bg-primary text-primary-foreground shadow-pop-sm" : "border-border bg-background hover:border-ink"}`}>
                <div className="font-display font-semibold">{s.label}</div>
                <div className={`text-xs ${form.style === s.id ? "opacity-90" : "text-muted-foreground"}`}>{s.hint}</div>
              </button>
            ))}
          </div>
          <div>
            <Label>Colors</Label>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {PALETTES.map((p) => (
                <button key={p.id} onClick={() => setForm({ ...form, palette: p.id })}
                  className={`rounded-xl border-2 p-2 ${form.palette === p.id ? "border-ink shadow-pop-sm" : "border-border"}`}>
                  <div className="flex h-6 overflow-hidden rounded-md">{p.colors.map((c) => <span key={c} className="flex-1" style={{ background: c }} />)}</div>
                  <div className="mt-1 text-xs font-semibold">{p.label}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            {["16:9", "9:16"].map((a) => (
              <Button key={a} size="sm" variant={form.aspect === a ? "default" : "outline"} onClick={() => setForm({ ...form, aspect: a })} className="rounded-full">
                {a === "16:9" ? "Wide (YouTube)" : "Tall (Shorts)"}
              </Button>
            ))}
          </div>
          <Button size="lg" disabled={!!busy} onClick={saveAndAnalyze} className="w-full rounded-full border-2 border-ink shadow-pop-sm">
            {busy === "analyze" ? "Planning scenes…" : scenes.length ? "Re-plan scenes" : "Plan my scenes"}
          </Button>
        </div>
      </section>

      {scenes.length > 0 && (
        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">3. Scenes</h2>
              <Button disabled={!!busy || !!generating} onClick={makeAll} className="rounded-full border-2 border-ink">
                {generating ? "Making clips…" : "Make all clips"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Each clip takes 1–3 minutes and uses AI credits.</p>
            {scenes.map((s, i) => (
              <SceneCard key={s.id} scene={s} index={i} busy={!!busy}
                onMake={() => run(s.id, () => start({ data: { projectId: id, sceneId: s.id } }))}
                onEdit={(instruction) => run(s.id, () => edit({ data: { projectId: id, sceneId: s.id, instruction } }))} />
            ))}
          </div>
          <aside className="space-y-4">
            <h2 className="text-2xl font-semibold">AI suggestions</h2>
            {suggestions.length === 0 && <p className="text-sm text-muted-foreground">All suggestions applied.</p>}
            {suggestions.map((g) => (
              <div key={g.id} className="card-pop p-4">
                <div className="font-display font-semibold">{g.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{g.detail}</p>
                {g.sceneId && scenes.some((s) => s.id === g.sceneId) && (
                  <Button size="sm" disabled={!!busy} className="mt-3 rounded-full" variant="secondary"
                    onClick={() => run(g.id, () => edit({ data: { projectId: id, sceneId: g.sceneId!, instruction: g.instruction, suggestionId: g.id } }))}>
                    {busy === g.id ? "Applying…" : "Apply"}
                  </Button>
                )}
              </div>
            ))}
          </aside>
        </section>
      )}

      {scenes.some((s) => s.status === "done") && <Player scenes={scenes} settings={settings} aspect={project.aspect} />}
    </div>
  );
}

function SceneCard({ scene, index, busy, onMake, onEdit }: { scene: Scene; index: number; busy: boolean; onMake: () => void; onEdit: (i: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [instr, setInstr] = useState("");
  useEffect(() => { signedUrl(scene.clipPath).then(setUrl); }, [scene.clipPath]);
  return (
    <div className="card-pop grid gap-4 p-4 md:grid-cols-[220px_1fr]">
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-muted text-sm text-muted-foreground">
        {url ? <video src={url} controls className="h-full w-full object-cover" /> :
          scene.status === "generating" ? "Animating… ✨" : scene.status === "failed" ? "Failed" : "Not made yet"}
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold">{index + 1}. {scene.title}</h3>
          <span className="text-xs text-muted-foreground">{scene.start}–{scene.end}s</span>
        </div>
        <p className="text-sm">{scene.visual}</p>
        {scene.dialogue && <p className="text-sm italic text-muted-foreground">{scene.dialogue}</p>}
        {scene.onScreenText && <p className="text-sm font-semibold">Text: “{scene.onScreenText}”</p>}
        {scene.error && <p className="text-sm text-destructive">{scene.error}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Input className="h-9 min-w-48 flex-1" placeholder="Edit: make Benny jump higher…" value={instr} onChange={(e) => setInstr(e.target.value)} />
          <Button size="sm" variant="outline" disabled={busy || instr.length < 2} onClick={() => { onEdit(instr); setInstr(""); }}>Edit</Button>
          <Button size="sm" disabled={busy || scene.status === "generating"} onClick={onMake}>
            {scene.status === "done" ? "Remake" : scene.status === "generating" ? "Making…" : "Make clip"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Player({ scenes, settings, aspect }: { scenes: Scene[]; settings: any; aspect: string }) {
  const done = scenes.filter((s) => s.status === "done");
  const [step, setStep] = useState<number | null>(null); // -1 intro, 0.. clips
  const [urls, setUrls] = useState<string[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  useEffect(() => {
    Promise.all(done.map((s) => signedUrl(s.clipPath))).then((u) => setUrls(u.filter(Boolean) as string[]));
    signedUrl(settings?.logo_path).then(setLogo);
    signedUrl(settings?.custom_intro_path).then(setCustom);
  }, [done.map((s) => s.clipPath).join(), settings?.logo_path, settings?.custom_intro_path]); // eslint-disable-line react-hooks/exhaustive-deps
  const introOn = settings?.intro_enabled ?? true;
  const next = useCallback(() => setStep((s) => (s === null ? null : s + 1 < urls.length ? s + 1 : null)), [urls.length]);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">4. Watch your video</h2>
      <div className={`card-pop mx-auto overflow-hidden bg-ink ${aspect === "9:16" ? "aspect-[9/16] max-w-sm" : "aspect-video"}`}>
        {step === null ? (
          <button onClick={() => setStep(introOn ? -1 : 0)} className="flex h-full w-full items-center justify-center font-display text-3xl text-ink-foreground">
            ▶ Play {done.length} scene{done.length > 1 ? "s" : ""}{introOn ? " with intro" : ""}
          </button>
        ) : step === -1 ? (
          <ChannelIntro logoUrl={logo} channelName={settings?.channel_name ?? ""} customUrl={custom}
            customIsVideo={!!settings?.custom_intro_path?.match(/\.(mp4|webm|mov)$/i)}
            seconds={Number(settings?.intro_seconds ?? 3)} onDone={() => setStep(0)} />
        ) : (
          <video key={urls[step]} src={urls[step]} autoPlay onEnded={next} className="h-full w-full object-contain" />
        )}
      </div>
    </section>
  );
}
