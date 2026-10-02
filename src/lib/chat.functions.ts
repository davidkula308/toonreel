import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatGemini, nanoBanana, type ChatMsg } from "./ai.server";

export const sendChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      threadId: z.string().uuid(),
      text: z.string().max(8000),
      images: z.array(z.string().max(500)).max(6),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const uid = context.userId;
    if (data.images.some((p) => !p.startsWith(`${uid}/`))) throw new Error("Invalid image");
    const { data: thread, error: te } = await sb.from("chat_threads").select("*").eq("id", data.threadId).single();
    if (te || !thread) throw new Error("Chat not found");

    const { error: ie } = await sb.from("chat_messages").insert({ thread_id: thread.id, user_id: uid, role: "user", content: data.text, images: data.images });
    if (ie) throw new Error(ie.message);

    const [{ data: history }, { data: memories }, projectRes, { data: recentProjects }] = await Promise.all([
      sb.from("chat_messages").select("role,content,images").eq("thread_id", thread.id).order("created_at").limit(60),
      sb.from("ai_memories").select("fact").eq("user_id", uid).order("created_at", { ascending: false }).limit(40),
      thread.project_id ? sb.from("projects").select("title,description,script,style,palette,aspect,scenes").eq("id", thread.project_id).maybeSingle() : Promise.resolve({ data: null }),
      sb.from("projects").select("title,description,updated_at").order("updated_at", { ascending: false }).limit(5),
    ]);
    const project = projectRes.data;

    const sign = async (p: string) => (await sb.storage.from("media").createSignedUrl(p, 3600)).data?.signedUrl as string | undefined;

    const system = `You are Toonie, the creative assistant inside ToonReel, a studio for kids' cartoon videos. Answer any question helpfully, help write scripts, design characters, plan scenes and give feedback on reference images.
What you remember about this user from earlier chats and actions:
${(memories ?? []).map((m: any) => `- ${m.fact}`).join("\n") || "- nothing yet"}
Their recent projects: ${(recentProjects ?? []).map((p: any) => `"${p.title}" (${p.description})`).join("; ") || "none"}
${project ? `Current project: ${JSON.stringify({ ...project, scenes: (project.scenes ?? []).map((s: any) => ({ title: s.title, visual: s.visual, dialogue: s.dialogue, status: s.status })) }).slice(0, 6000)}` : ""}
Rules:
- When you learn a lasting preference or fact about the user, their characters or channel, add on its own line: <memory>short fact</memory>
- When the user wants a picture (character design, background, thumbnail, style test), add on its own line: <image>detailed image prompt, kid-friendly cartoon</image> — reference images they attached will be used.
- Use markdown. Keep it friendly and concise.`;

    const msgs: ChatMsg[] = [{ role: "system", content: system }];
    const userRefs: string[] = [];
    for (const m of history ?? []) {
      if (m.role === "user" && m.images?.length) {
        const urls = (await Promise.all(m.images.map(sign))).filter(Boolean) as string[];
        userRefs.splice(0, userRefs.length, ...urls);
        msgs.push({ role: "user", content: [{ type: "text", text: m.content || "(see image)" }, ...urls.map((url) => ({ type: "image_url" as const, image_url: { url } }))] });
      } else {
        msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content || "(image)" });
      }
    }

    let reply = await chatGemini(msgs);
    const facts = [...reply.matchAll(/<memory>([\s\S]*?)<\/memory>/g)].map((x) => x[1]!.trim()).filter(Boolean);
    const imagePrompt = reply.match(/<image>([\s\S]*?)<\/image>/)?.[1]?.trim();
    reply = reply.replace(/<memory>[\s\S]*?<\/memory>/g, "").replace(/<image>[\s\S]*?<\/image>/g, "").trim();

    const outImages: string[] = [];
    if (imagePrompt) {
      try {
        const { bytes, mime } = await nanoBanana(imagePrompt, userRefs.slice(0, 4));
        const path = `${uid}/chat/${thread.id}/${crypto.randomUUID()}.${mime.split("/")[1] ?? "png"}`;
        const { error } = await sb.storage.from("media").upload(path, bytes, { contentType: mime });
        if (!error) outImages.push(path);
      } catch (e) {
        reply += `\n\n_Couldn't draw the picture: ${(e as Error).message}_`;
      }
    }
    if (facts.length) await sb.from("ai_memories").insert(facts.map((fact) => ({ user_id: uid, fact: fact.slice(0, 300) })));

    const { error: ae } = await sb.from("chat_messages").insert({ thread_id: thread.id, user_id: uid, role: "assistant", content: reply || "🙂", images: outImages });
    if (ae) throw new Error(ae.message);
    const title = thread.title === "New chat" && data.text ? data.text.slice(0, 40) : thread.title;
    await sb.from("chat_threads").update({ title, updated_at: new Date().toISOString() }).eq("id", thread.id);
    return { ok: true };
  });
