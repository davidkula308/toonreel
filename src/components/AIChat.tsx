import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendChat } from "@/lib/chat.functions";
import { signedUrl } from "@/lib/use-auth";

function SignedImg({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { signedUrl(path).then(setUrl); }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="" className="max-h-56 rounded-lg border-2 border-ink" /></a> : <div className="h-24 w-24 rounded-lg bg-muted" />;
}

export function AIChat({ userId, projectId }: { userId: string; projectId: string }) {
  const qc = useQueryClient();
  const send = useServerFn(sendChat);
  const [active, setActive] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState<{ text: string } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: threads = [] } = useQuery({
    queryKey: ["threads", projectId],
    queryFn: async () => (await supabase.from("chat_threads").select("id,title,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false })).data ?? [],
  });
  useEffect(() => { if (!active && threads[0]) setActive(threads[0].id); }, [threads, active]);

  const { data: messages = [] } = useQuery({
    queryKey: ["messages", active],
    enabled: !!active,
    queryFn: async () => (await supabase.from("chat_messages").select("id,role,content,images").eq("thread_id", active!).order("created_at")).data ?? [],
  });
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending]);
  useEffect(() => { inputRef.current?.focus(); }, [active, pending]);

  const newChat = async () => {
    const { data, error } = await supabase.from("chat_threads").insert({ user_id: userId, project_id: projectId }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    await qc.invalidateQueries({ queryKey: ["threads", projectId] });
    setActive(data.id);
    return data.id as string;
  };

  const clearChats = async () => {
    if (!confirm("Delete all chats for this video? What the AI learned about you is kept.")) return;
    const { error } = await supabase.from("chat_threads").delete().eq("project_id", projectId);
    if (error) { toast.error(error.message); return; }
    setActive(null);
    qc.invalidateQueries({ queryKey: ["threads", projectId] });
  };

  const submit = async () => {
    if ((!text.trim() && !files.length) || pending) return;
    const msg = text.trim();
    setPending({ text: msg });
    setText("");
    try {
      const threadId = active ?? (await newChat());
      if (!threadId) throw new Error("Could not start a chat");
      const paths: string[] = [];
      for (const f of files) {
        const path = `${userId}/chat/${threadId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.]/g, "_")}`;
        const { error } = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
        if (error) throw error;
        paths.push(path);
      }
      setFiles([]);
      await send({ data: { threadId, text: msg, images: paths } });
      await Promise.all([qc.invalidateQueries({ queryKey: ["messages", threadId] }), qc.invalidateQueries({ queryKey: ["threads", projectId] })]);
    } catch (e) {
      toast.error((e as Error).message);
      setText(msg);
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold">Ask Toonie, your AI helper</h2>
      <div className="card-pop grid h-[560px] overflow-hidden md:grid-cols-[220px_1fr]">
        <aside className="flex flex-col border-b-2 border-ink md:border-b-0 md:border-r-2">
          <div className="flex gap-2 p-3">
            <Button size="sm" onClick={newChat} className="flex-1 rounded-full">+ New chat</Button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-2">
            {threads.map((t) => (
              <button key={t.id} onClick={() => setActive(t.id)}
                className={`w-full truncate rounded-lg px-3 py-2 text-left text-sm ${active === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                {t.title}
              </button>
            ))}
            {threads.length === 0 && <p className="px-3 text-xs text-muted-foreground">No chats yet</p>}
          </div>
          {threads.length > 0 && <button onClick={clearChats} className="p-3 text-left text-xs text-destructive underline">Clear chats</button>}
        </aside>
        <div className="flex min-h-0 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && !pending && (
              <p className="text-sm text-muted-foreground">Ask anything — script ideas, character designs, or upload a reference picture and ask Toonie to draw in that style.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-ink px-4 py-2 text-ink-foreground" : "max-w-[95%]"}>
                {m.content && <div className="prose prose-sm max-w-none [&_*]:text-inherit"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
                {m.images?.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.images.map((p: string) => <SignedImg key={p} path={p} />)}</div>}
              </div>
            ))}
            {pending && (
              <>
                {pending.text && <div className="ml-auto max-w-[85%] rounded-2xl bg-ink px-4 py-2 text-ink-foreground">{pending.text}</div>}
                <p className="animate-pulse text-sm text-muted-foreground">Toonie is thinking…</p>
              </>
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t-2 border-ink p-3">
            {files.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 text-xs">
                {files.map((f, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-1">{f.name} <button onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
              <label className="cursor-pointer rounded-full border-2 border-ink px-3 py-2 text-sm font-semibold" title="Add reference images">
                🖼️
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 6)); e.target.value = ""; }} />
              </label>
              <Textarea ref={inputRef} rows={2} value={text} placeholder="Type a message…" className="min-h-0 flex-1 resize-none"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }} />
              <Button onClick={submit} disabled={!!pending} className="rounded-full">Send</Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
