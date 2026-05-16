UPDATE public.prf_submissions p
SET lead_id = l.id
FROM public.sales_leads l
WHERE p.lead_id IS NULL
  AND p.email IS NOT NULL
  AND lower(p.email) = lower(l.email);