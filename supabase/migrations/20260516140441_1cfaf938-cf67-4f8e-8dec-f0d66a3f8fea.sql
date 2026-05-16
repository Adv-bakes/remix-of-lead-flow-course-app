
ALTER TABLE public.batch_sheets
  ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS superseded_by_version int,
  ADD COLUMN IF NOT EXISTS last_edited_by uuid,
  ADD COLUMN IF NOT EXISTS xlsx_path text;

-- Storage bucket (private, staff-only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('batch-sheets', 'batch-sheets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: staff/admin only
DROP POLICY IF EXISTS "Staff can read batch sheet files" ON storage.objects;
CREATE POLICY "Staff can read batch sheet files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'batch-sheets' AND public.is_staff_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff can write batch sheet files" ON storage.objects;
CREATE POLICY "Staff can write batch sheet files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'batch-sheets' AND public.is_staff_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff can update batch sheet files" ON storage.objects;
CREATE POLICY "Staff can update batch sheet files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'batch-sheets' AND public.is_staff_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Staff can delete batch sheet files" ON storage.objects;
CREATE POLICY "Staff can delete batch sheet files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'batch-sheets' AND public.is_staff_or_admin(auth.uid()));
