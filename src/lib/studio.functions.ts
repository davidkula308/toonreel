import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askAI, parseJSON, createVideoJob, pollVideoJob, downloadVideo } from "./ai.server";
import { STYLES, PALETTES, type Scene, type Suggestion } from "./studio-types";

type Ctx = { supabase: any; userId: string };

async function load(ctx: Ctx, projectId: string) {
  const { data: project, error } = await ctx.supabase.from("projects").select("*").eq("id", projectId).single();
  if (error || !project) throw new Error("Project not found");
  const { data: settings } = await ctx.supabase.from("user_settings").select("*").eq("user_id", ctx.userId).maybeSingle();
  return { project, settings };
}

function aiPersona(settings: any) {
  const t = settings?.thoroughness ?? 3;
  return `Thoroughness level ${t}/5 (${t >= 4 ? "very detailed, many suggestions" : t <= 2 ? "brief, only key suggestions" : "balanced"}). Tone: ${settings?.tone ?? "Playful"}. Pay special attention to: ${settings?.detail_focus ?? "characters and pacing"}.`;
}

function styleText(project: any) {
  const s = STYLES.find((x) => x.id === project.style);
  const p = PALETTES.find((x) => x.id === project.palette);
  return `${s?.label ?? project.style} style (${s?.hint ?? ""}), ${p?.label ?? project.palette} color palette (${p?.colors.join(", ") ?? ""})`;
}

const SCENE_SHAPE = `{"id":"s1","title":"short","start":0,"end":5,"visual":"what we see, characters' look and action","dialogue":"Name: \\"line\\" (or empty)","onScreenText":"exact words or empty"}`;

export const analyzeScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { project, settings } = await load(context as Ctx, data.projectId);
    const system = `You are a children's animated-video director. Turn any script format (timestamps, prose, bullet ideas) into short scenes of 3-10 seconds each, then recommend improvements. ${aiPersona(settings)}
Reply with JSON only: {"title":"video title","scenes":[${SCENE_SHAPE}],"suggestions":[{"id":"g1","title":"short","detail":"why it helps","sceneId":"s1 or null","instruction":"precise edit to apply to that scene"}]}`;
    const prompt = `Description: ${project.description}\nVisual style: ${styleText(project)}\nScript:\n${project.script}`;
    const out = parseJSON<{ title: string; scenes: Scene[]; suggestions: Suggestion[] }>(await askAI(system, prompt));
    const scenes = (out.scenes ?? []).map((s, i) => ({ ...s, id: s.id || `s${i + 1}`, status: "idle" as const }));
    const { error } = await context.supabase
      .from("projects")
      .update({ title: out.title || project.title, scenes, suggestions: out.suggestions ?? [], updated_at: new Date().toISOString() })
      .eq("id", project.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const editScene = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ projectId: z.string().uuid(), sceneId: z.string(), instruction: z.string().min(2).max(2000), suggestionId: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { project, settings } = await load(context as Ctx, data.projectId);
    const scenes = project.scenes as Scene[];
    const idx = scenes.findIndex((s) => s.id === data.sceneId);
    if (idx < 0) throw new Error("Scene not found");
    const system = `You edit one scene of a children's animated video. ${aiPersona(settings)} Keep the same id. Reply with the updated scene JSON only, shape: ${SCENE_SHAPE}`;
    const updated = parseJSON<Scene>(
      await askAI(system, `Style: ${styleText(project)}\nScene: ${JSON.stringify(scenes[idx])}\nEdit: ${data.instruction}`, "low"),
    );
    scenes[idx] = { ...scenes[idx], ...updated, id: scenes[idx].id, status: "idle", clipPath: null, jobId: null, error: null };
    const suggestions = (project.suggestions as Suggestion[]).filter((s) => s.id !== data.suggestionId);
    await context.supabase.from("projects").update({ scenes, suggestions }).eq("id", project.id);
    return { ok: true };
  });

export const startClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), sceneId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { project } = await load(context as Ctx, data.projectId);
    const scenes = project.scenes as Scene[];
    const scene = scenes.find((s) => s.id === data.sceneId);
    if (!scene) throw new Error("Scene not found");
    const seconds = Math.max(3, Math.min(10, (scene.end ?? 5) - (scene.start ?? 0)));
    const cast = scenes.map((s) => s.visual).join(" ").slice(0, 600);
    const input = `${styleText(project)}. Kid-friendly animated short. ${scene.visual}
${scene.dialogue ? `Characters speak, in cheerful voices: ${scene.dialogue}` : "No dialogue."}
${scene.onScreenText ? `On-screen text reads: "${scene.onScreenText}"` : "No on-screen text."}
Audio: playful light music and fitting sound effects.
Keep characters consistent with this series: ${cast}
In a single continuous shot. Consider micro-detail, expression and timing.`;
    const job = await createVideoJob(input, seconds, project.aspect);
    Object.assign(scene, { status: "generating", jobId: job.id, error: null, clipPath: null });
    await context.supabase.from("projects").update({ scenes }).eq("id", project.id);
    return { jobId: job.id };
  });

export const checkClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), sceneId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { project } = await load(context as Ctx, data.projectId);
    const scenes = project.scenes as Scene[];
    const scene = scenes.find((s) => s.id === data.sceneId);
    if (!scene?.jobId) return { status: scene?.status ?? "idle" };
    if (scene.status === "done") return { status: "done" };
    const job = await pollVideoJob(scene.jobId);
    if (job.status === "failed") {
      Object.assign(scene, { status: "failed", error: job.error?.message ?? "Video generation failed" });
    } else if (job.status === "completed") {
      const path = `${context.userId}/${project.id}/${scene.id}-${scene.jobId}.mp4`;
      const bytes = await downloadVideo(scene.jobId);
      const { error } = await context.supabase.storage.from("media").upload(path, bytes, { contentType: "video/mp4", upsert: true });
      if (error) throw new Error(error.message);
      Object.assign(scene, { status: "done", clipPath: path });
    } else {
      return { status: "generating" };
    }
    await context.supabase.from("projects").update({ scenes }).eq("id", project.id);
    return { status: scene.status, error: scene.error };
  });
