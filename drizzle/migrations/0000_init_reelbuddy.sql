CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY,
  thoroughness int NOT NULL DEFAULT 3,
  detail_focus text NOT NULL DEFAULT 'Character expressions, colors, and pacing',
  tone text NOT NULL DEFAULT 'Playful',
  channel_name text NOT NULL DEFAULT '',
  logo_path text,
  intro_enabled boolean NOT NULL DEFAULT true,
  intro_seconds numeric NOT NULL DEFAULT 3,
  custom_intro_path text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Untitled video',
  description text NOT NULL DEFAULT '',
  script text NOT NULL DEFAULT '',
  style text NOT NULL DEFAULT 'cartoon',
  palette text NOT NULL DEFAULT 'sunny',
  aspect text NOT NULL DEFAULT '16:9',
  scenes jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own media read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'media' AND (storage.foldername(name))[1] = auth.uid()::text);