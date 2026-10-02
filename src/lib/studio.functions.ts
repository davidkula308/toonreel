import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { askAI, parseJSON, createVideoJob, pollVideoJob, downloadVideo, nanoBanana } from "./ai.server";
import { loadSub, recordUse, countRemakes, projectStartedToday } from "./billing.server";
import { PLANS, creditCost } from "./plans";
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

const sceneSeconds = (s: Scene) => Math.max(3, Math.min(10, (s.end ?? 5) - (s.start ?? 0)));

const SCENE_SHAPE = `{"id":"s1","title":"short","start":0,"end":5,"visual":"what we see, characters' look and action","dialogue":"Name: \\"line\\" (or empty)","onScreenText":"exact words or empty"}`;

export const analyzeScript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { project, settings } = await load(context as Ctx, data.projectId);
    const { info } = await loadSub(context.userId);
    const plan = PLANS[info.plan];
    // Free plan: split remaining daily credits across the remaining videos of the day.
    let budget: number | null = null;
    if (info.plan === "free") {
      const left = Math.max(1, (plan.videosPerDay ?? 2) - info.videosToday);
      budget = Math.max(3, Math.floor((info.creditsLeft ?? 0) / left));
    } else if (info.creditsLeft !== null) {
      budget = Math.max(3, info.creditsLeft);
    }
    const budgetText = budget ? `\nIMPORTANT: total video length must be at most ${budget} seconds (sum of all scenes, each 3-10s). Condense the story to fit.` : "";
    const system = `You are a children's animated-video director. Turn any script format (timestamps, prose, bullet ideas) into at most ${plan.maxScenes} short scenes of 3-10 seconds each, then recommend improvements. ${aiPersona(settings)}${budgetText}
Reply with JSON only: {"title":"video title","scenes":[${SCENE_SHAPE}],"suggestions":[{"id":"g1","title":"short","detail":"why it helps","sceneId":"s1 or null","instruction":"precise edit to apply to that scene"}]}`;
    const prompt = `Description: ${project.description}\nVisual style: ${styleText(project)}\nScript:\n${project.script}`;
    const out = parseJSON<{ title: string; scenes: Scene[]; suggestions: Suggestion[] }>(await askAI(system, prompt));
    let scenes = (out.scenes ?? []).slice(0, plan.maxScenes).map((s, i) => ({ ...s, id: s.id || `s${i + 1}`, status: "idle" as const }));
    if (budget) {
      // Fit to budget: keep scenes in order, shrink the last one if needed.
      const fitted: Scene[] = [];
      let used = 0;
      for (const s of scenes) {
        const len = sceneSeconds(s);
        if (used + len <= budget) { fitted.push(s); used += len; }
        else if (budget - used >= 3) { fitted.push({ ...s, end: s.start + (budget - used) }); used = budget; }
      }
      scenes = fitted.length ? fitted : scenes.slice(0, 1).map((s) => ({ ...s, end: s.start + 3 }));
    }
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
    const { info } = await loadSub(context.userId);
    if (!PLANS[info.plan].applySuggestions) throw new Error("Editing scenes and applying suggestions needs a paid plan. Upgrade on the Plans page.");
    const { project, settings } = await load(context as Ctx, data.projectId);
    const scenes = project.scenes as Scene[];
    const idx = scenes.findIndex((s) => s.id === data.sceneId);
    if (idx < 0) throw new Error("Scene not found");
    const system = `You edit one scene of a children's animated video. ${aiPersona(settings)} Keep the same id. Reply with the updated scene JSON only, shape: ${SCENE_SHAPE}`;
    const updated = parseJSON<Scene>(
      await askAI(system, `Style: ${styleText(project)}\nScene: ${JSON.stringify(scenes[idx])}\nEdit: ${data.instruction}`, "low"),
    );
    const prev = scenes[idx]!;
    scenes[idx] = { ...prev, ...updated, id: prev.id, status: "idle", clipPath: prev.clipPath ?? null, jobId: null, error: null, remake: !!prev.clipPath || prev.remake };
    const suggestions = (project.suggestions as Suggestion[]).filter((s) => s.id !== data.suggestionId);
    await context.supabase.from("projects").update({ scenes, suggestions }).eq("id", project.id);
    return { ok: true };
  });

export const startClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), sceneId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { project } = await load(context as Ctx, data.projectId);
    const { info } = await loadSub(context.userId);
    const plan = PLANS[info.plan];
    if (!info.active) throw new Error(info.expiredReason ?? "Pick a plan to keep making videos.");
    const scenes = project.scenes as Scene[];
    const scene = scenes.find((s) => s.id === data.sceneId);
    if (!scene) throw new Error("Scene not found");
    if (project.aspect === "9:16" && !plan.vertical) throw new Error("Tall Shorts videos need a paid plan. Switch to Wide or upgrade.");

    const isRemake = !!scene.clipPath || !!scene.remake;
    if (isRemake) {
      if (plan.remakesPerVideo === 0) throw new Error("Re-making scenes needs a paid plan. Upgrade on the Plans page.");
      if (plan.remakesPerVideo !== null && (await countRemakes(context.userId, project.id)) >= plan.remakesPerVideo)
        throw new Error(`Your ${plan.name} plan allows ${plan.remakesPerVideo} re-makes per video. Upgrade to Star for unlimited.`);
    }
    if (plan.videosPerDay !== null && info.videosToday >= plan.videosPerDay && !(await projectStartedToday(context.userId, project.id)))
      throw new Error(`The free plan makes ${plan.videosPerDay} videos per 24 hours. Come back later or upgrade.`);

    const seconds = sceneSeconds(scene);
    const cost = creditCost(seconds);
    if (info.creditsLeft !== null && info.creditsLeft < cost)
      throw new Error(`This clip needs ${cost} credits but you have ${info.creditsLeft}. ${info.plan === "free" ? "Credits refill every 24 hours, or upgrade." : "Upgrade for more credits."}`);

    const cast = scenes.map((s) => s.visual).join(" ").slice(0, 600);
    const look = `${styleText(project)}. Kid-friendly animated short.`;

    // 1) Nano Banana draws the keyframe so characters stay consistent.
    let imageUrl: string | undefined;
    let keyframePath: string | null = null;
    try {
      const img = await nanoBanana(
        `${look} Single keyframe illustration for this scene, no text: ${scene.visual}. Keep characters consistent with this series: ${cast}`,
        [],
      );
      keyframePath = `${context.userId}/${project.id}/${scene.id}-key-${Date.now()}.png`;
      await context.supabase.storage.from("media").upload(keyframePath, img.bytes, { contentType: img.mime, upsert: true });
      let b64 = "";
      for (let i = 0; i < img.bytes.length; i += 0x8000) b64 += String.fromCharCode(...img.bytes.subarray(i, i + 0x8000));
      imageUrl = `data:${img.mime};base64,${btoa(b64)}`;
    } catch (e) {
      console.warn("keyframe failed", e);
    }

    // 2) Gemini animates it.
    const input = `${look} ${scene.visual}
${scene.dialogue ? `Characters speak, in cheerful voices: ${scene.dialogue}` : "No dialogue."}
${scene.onScreenText ? `On-screen text reads: "${scene.onScreenText}"` : "No on-screen text."}
Audio: playful light music and fitting sound effects.
Keep characters consistent with this series: ${cast}
In a single continuous shot. Consider micro-detail, expression and timing.`;
    const job = await createVideoJob(input, seconds, project.aspect, { resolution: plan.resolution, imageUrl });
    await recordUse(context.userId, project.id, scene.id, isRemake ? "remake" : "clip", cost, info.creditsLeft === null);
    if (isRemake) await recordUse(context.userId, project.id, scene.id, "clip", 0, true);
    Object.assign(scene, { status: "generating", jobId: job.id, error: null, clipPath: null, keyframePath, remake: true });
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
