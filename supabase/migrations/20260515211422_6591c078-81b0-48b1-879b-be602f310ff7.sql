
-- Speed up inbox queries
CREATE INDEX IF NOT EXISTS idx_prf_submissions_status_created
  ON public.prf_submissions (status, created_at DESC);

-- New table: sales_leads (prospect cards independent of auth.users)
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  company_name text,
  contact_name text,
  phone text,
  stage text NOT NULL DEFAULT 'Lead In',
  stage_updated_at timestamptz NOT NULL DEFAULT now(),
  archived_reason text,
  archived_at timestamptz,
  profile_id uuid,
  notes text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_leads_email_lower
  ON public.sales_leads (lower(email));
CREATE INDEX IF NOT EXISTS idx_sales_leads_stage ON public.sales_leads (stage);

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff/admin all sales_leads" ON public.sales_leads;
CREATE POLICY "Staff/admin all sales_leads"
  ON public.sales_leads
  FOR ALL
  TO authenticated
  USING (is_staff_or_admin(auth.uid()))
  WITH CHECK (is_staff_or_admin(auth.uid()));

CREATE TRIGGER trg_sales_leads_touch
  BEFORE UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Trigger: auto-upsert a sales_lead card on each PRF insert
CREATE OR REPLACE FUNCTION public.prf_upsert_sales_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_email text;
BEGIN
  lead_email := nullif(trim(NEW.email), '');
  IF lead_email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_leads (email, company_name, contact_name, phone, profile_id)
  VALUES (lead_email, NEW.company_name, NEW.founder_name, NEW.phone, NEW.owner_user_id)
  ON CONFLICT ((lower(email)))
  DO UPDATE SET
    company_name = COALESCE(public.sales_leads.company_name, EXCLUDED.company_name),
    contact_name = COALESCE(public.sales_leads.contact_name, EXCLUDED.contact_name),
    phone        = COALESCE(public.sales_leads.phone, EXCLUDED.phone),
    profile_id   = COALESCE(public.sales_leads.profile_id, EXCLUDED.profile_id),
    -- if archived, restore to Lead In
    stage = CASE WHEN public.sales_leads.stage = 'Archived' THEN 'Lead In' ELSE public.sales_leads.stage END,
    stage_updated_at = CASE WHEN public.sales_leads.stage = 'Archived' THEN now() ELSE public.sales_leads.stage_updated_at END,
    archived_reason = CASE WHEN public.sales_leads.stage = 'Archived' THEN NULL ELSE public.sales_leads.archived_reason END,
    archived_at = CASE WHEN public.sales_leads.stage = 'Archived' THEN NULL ELSE public.sales_leads.archived_at END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prf_upsert_sales_lead ON public.prf_submissions;
CREATE TRIGGER trg_prf_upsert_sales_lead
  AFTER INSERT ON public.prf_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.prf_upsert_sales_lead();

-- Backfill existing PRFs
INSERT INTO public.sales_leads (email, company_name, contact_name, phone, profile_id, created_at)
SELECT
  lower(p.email),
  (array_agg(p.company_name ORDER BY p.created_at DESC) FILTER (WHERE p.company_name IS NOT NULL))[1],
  (array_agg(p.founder_name ORDER BY p.created_at DESC) FILTER (WHERE p.founder_name IS NOT NULL))[1],
  (array_agg(p.phone ORDER BY p.created_at DESC) FILTER (WHERE p.phone IS NOT NULL))[1],
  (array_agg(p.owner_user_id ORDER BY p.created_at DESC) FILTER (WHERE p.owner_user_id IS NOT NULL))[1],
  min(p.created_at)
FROM public.prf_submissions p
WHERE p.email IS NOT NULL AND length(trim(p.email)) > 0
GROUP BY lower(p.email)
ON CONFLICT ((lower(email))) DO NOTHING;
