DROP POLICY IF EXISTS "Users update own stage2_prf by id" ON public.stage2_prf_submissions;

CREATE POLICY "Public update draft stage2_prf"
ON public.stage2_prf_submissions
FOR UPDATE
TO anon, authenticated
USING (COALESCE(status, 'draft') <> 'submitted')
WITH CHECK (true);