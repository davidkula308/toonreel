import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ChannelIntro } from "@/components/ChannelIntro";
import { signedUrl, useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — ToonReel" }, { name: "description", content: "AI behavior and channel intro settings." }] }),
  component: Settings,
});

const defaults = { thoroughness: 3, detail_focus: "Character expressions, colors, and pacing", tone: "Playful", channel_name: "", logo_path: null as string | null, intro_enabled: true, intro_seconds: 3, custom_intro_path: null as string | null };

function Settings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("user_settings").select("*").eq("user_id", user!.id).maybeSingle()).data,
  });
  const [s, setS] = useState(defaults);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState(0);

  useEffect(() => { if (data) setS({ ...defaults, ...data, intro_seconds: Number(data.intro_seconds) }); }, [data]);
  useEffect(() => { signedUrl(s.logo_path).then(setLogoUrl); }, [s.logo_path]);
  useEffect(() => { signedUrl(s.custom_intro_path).then(setCustomUrl); }, [s.custom_intro_path]);

  const upload = async (file: File, field: "logo_path" | "custom_intro_path") => {
    const path = `${user!.id}/${field}-${Date.now()}-${file.name.replace(/[^\w.]/g, "_")}`;
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    setS((x) => ({ ...x, [field]: path }));
    toast.success("Uploaded — remember to save.");
  };

  const save = async () => {
    const { error } = await supabase.from("user_settings").upsert({ ...s, user_id: user!.id, updated_at: new Date().toISOString() });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["settings"] });
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <h1 className="text-4xl font-bold">Settings</h1>
        <Button onClick={save} className="rounded-full border-2 border-ink shadow-pop-sm">Save settings</Button>
      </div>

      <section className="card-pop space-y-5 p-6">
        <h2 className="text-2xl font-semibold">AI behavior</h2>
        <div>
          <Label>How thorough should the AI be? ({s.thoroughness}/5)</Label>
          <Slider className="mt-3" min={1} max={5} step={1} value={[s.thoroughness]} onValueChange={([v]) => setS({ ...s, thoroughness: v ?? 3 })} />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>Quick & brief</span><span>Very detailed</span></div>
        </div>
        <div><Label>Details to pay attention to</Label>
          <Textarea value={s.detail_focus} onChange={(e) => setS({ ...s, detail_focus: e.target.value })} /></div>
        <div><Label>Tone</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {["Playful", "Calm", "Funny", "Educational", "Adventurous"].map((t) => (
              <Button key={t} size="sm" variant={s.tone === t ? "default" : "outline"} className="rounded-full" onClick={() => setS({ ...s, tone: t })}>{t}</Button>
            ))}
          </div>
        </div>
      </section>

      <section className="card-pop grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-5">
          <h2 className="text-2xl font-semibold">Channel intro</h2>
          <div className="flex items-center gap-3"><Switch checked={s.intro_enabled} onCheckedChange={(v) => setS({ ...s, intro_enabled: v })} /><Label>Play intro before every video</Label></div>
          <div><Label>Channel name (shouted in the intro)</Label>
            <Input value={s.channel_name} placeholder="Benny's Tiny Adventures" onChange={(e) => setS({ ...s, channel_name: e.target.value })} /></div>
          <div><Label>Channel logo</Label>
            <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo_path")} /></div>
          <div><Label>Intro length: {s.intro_seconds}s</Label>
            <Slider className="mt-3" min={1} max={10} step={0.5} value={[s.intro_seconds]} onValueChange={([v]) => setS({ ...s, intro_seconds: v ?? 3 })} /></div>
          <div>
            <Label>Use your own intro instead (image or video)</Label>
            <Input type="file" accept="image/*,video/*" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "custom_intro_path")} />
            {s.custom_intro_path && <Button variant="link" className="px-0" onClick={() => setS({ ...s, custom_intro_path: null })}>Back to default logo pop</Button>}
          </div>
        </div>
        <div className="space-y-3">
          <div className="aspect-video overflow-hidden rounded-2xl border-2 border-ink bg-ink">
            {preview ? (
              <ChannelIntro key={preview} logoUrl={logoUrl} channelName={s.channel_name} customUrl={customUrl}
                customIsVideo={!!s.custom_intro_path?.match(/\.(mp4|webm|mov)$/i)} seconds={s.intro_seconds} onDone={() => setPreview(0)} />
            ) : (
              <button onClick={() => setPreview(Date.now())} className="flex h-full w-full items-center justify-center font-display text-2xl text-ink-foreground">▶ Preview intro</button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Default: your logo pops in, zooms in and out, and the channel name is shouted with a pop sound.</p>
        </div>
      </section>
    </div>
  );
}
