import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.auth.getSession().then(({ data: d }) => {
      setSession(d.session);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return { session, user: session?.user ?? null, loading };
}

export async function signedUrl(path?: string | null) {
  if (!path) return null;
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** Saves a stored file to the user's device. */
export async function saveToDevice(path: string | null | undefined, filename: string) {
  if (!path) return;
  const { data } = await supabase.storage.from("media").createSignedUrl(path, 60 * 10, { download: filename });
  if (!data?.signedUrl) return;
  const a = document.createElement("a");
  a.href = data.signedUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export const fileSafe = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "video";
