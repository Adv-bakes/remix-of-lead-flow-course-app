DROP POLICY IF EXISTS "Public update draft stage2_prf" ON public.stage2_prf_submissions;

CREATE POLICY "Public update draft or submit stage2_prf"
ON public.stage2_prf_submissions
FOR UPDATE
TO anon, authenticated
USING (COALESCE(status, 'draft') = 'draft')
WITH CHECK (
  id IS NOT NULL
  AND company_stage IS NOT NULL
  AND COALESCE(status, 'draft') IN ('draft', 'submitted')
);