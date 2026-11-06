-- Tablas y storage para archivos por materia + tareas + tema_auto
CREATE TABLE IF NOT EXISTS public.tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  materia_id uuid NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descripcion text,
  fecha date,
  completada boolean NOT NULL DEFAULT false,
  creada timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tareas_propias" ON public.tareas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.archivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  materia_id uuid NOT NULL REFERENCES public.materias(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  extension text DEFAULT '',
  storage_path text NOT NULL,
  tamano bigint DEFAULT 0,
  subido timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.archivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "archivos_propios" ON public.archivos FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.config_usuario ADD COLUMN IF NOT EXISTS tema_auto boolean NOT NULL DEFAULT true;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('apuntes', 'apuntes', true, 52428800)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "apuntes_lectura" ON storage.objects FOR SELECT USING (bucket_id = 'apuntes');
CREATE POLICY "apuntes_subida" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'apuntes' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "apuntes_borrado" ON storage.objects FOR DELETE USING (bucket_id = 'apuntes' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Color principal personalizable de la app
ALTER TABLE public.config_usuario ADD COLUMN IF NOT EXISTS color_app text DEFAULT '#6366f1';
