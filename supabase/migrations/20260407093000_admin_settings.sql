CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_settings'
      AND policyname = 'Admins can view admin settings'
  ) THEN
    CREATE POLICY "Admins can view admin settings"
    ON public.admin_settings
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role::text = 'admin'
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_settings'
      AND policyname = 'Admins can update admin settings'
  ) THEN
    CREATE POLICY "Admins can update admin settings"
    ON public.admin_settings
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role::text = 'admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role::text = 'admin'
      )
    );
  END IF;
END $$;

INSERT INTO public.admin_settings (key, value)
VALUES
  (
    'generation_defaults',
    jsonb_build_object(
      'model', 'gemini-2.5-flash-image',
      'aspectRatio', '3:4',
      'resolution', '1k',
      'imageCount', 1
    )
  ),
  (
    'detail_defaults',
    jsonb_build_object(
      'model', 'gemini-3.1-flash-image-preview',
      'aspectRatio', '3:4',
      'resolution', '2k',
      'screenCount', 4
    )
  ),
  (
    'translation_defaults',
    jsonb_build_object(
      'targetLanguage', 'en',
      'batchLimit', 8,
      'renderMode', 'stable'
    )
  ),
  (
    'feature_flags',
    jsonb_build_object(
      'enableAdminRetry', true,
      'enableDetailDesign', true,
      'enableImageTranslation', true,
      'enableNanoBananaPro', true
    )
  ),
  (
    'operations',
    jsonb_build_object(
      'lowBalanceThreshold', 3,
      'imageRetentionDays', 30
    )
  )
ON CONFLICT (key) DO NOTHING;
