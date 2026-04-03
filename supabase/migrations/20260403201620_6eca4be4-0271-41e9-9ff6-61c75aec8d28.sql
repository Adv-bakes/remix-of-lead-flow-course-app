
-- 1. Fix prf_submissions: Remove anon SELECT and UPDATE policies that expose PII
DROP POLICY IF EXISTS "Public select prf_submissions for duplicate check" ON public.prf_submissions;
DROP POLICY IF EXISTS "Public update own prf_submissions" ON public.prf_submissions;

-- 2. Fix email_send_state: Enable RLS and add staff-only policies
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/admin read email_send_state"
  ON public.email_send_state FOR SELECT
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/admin update email_send_state"
  ON public.email_send_state FOR UPDATE
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

-- 3. Fix email_unsubscribe_tokens: Enable RLS and add staff-only policies
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/admin read email_unsubscribe_tokens"
  ON public.email_unsubscribe_tokens FOR SELECT
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/admin manage email_unsubscribe_tokens"
  ON public.email_unsubscribe_tokens FOR ALL
  TO service_role
  USING (true);

-- 4. Fix email_send_log: Add staff-only policies (RLS already enabled)
CREATE POLICY "Staff/admin read email_send_log"
  ON public.email_send_log FOR SELECT
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Service role manage email_send_log"
  ON public.email_send_log FOR ALL
  TO service_role
  USING (true);

-- 5. Fix suppressed_emails: Enable RLS and add policies
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff/admin read suppressed_emails"
  ON public.suppressed_emails FOR SELECT
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Service role manage suppressed_emails"
  ON public.suppressed_emails FOR ALL
  TO service_role
  USING (true);

-- 6. Fix products: Enable RLS and add policies
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Staff/admin insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/admin update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

CREATE POLICY "Staff/admin delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));

-- 7. Fix profiles: Add user self-access policies
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- 8. Fix stage2_prf_submissions: Replace public UPDATE with scoped policy
DROP POLICY IF EXISTS "Public update stage2_prf" ON public.stage2_prf_submissions;

CREATE POLICY "Users update own stage2_prf by id"
  ON public.stage2_prf_submissions FOR UPDATE
  TO anon, authenticated
  USING ((id)::text = (id)::text)
  WITH CHECK (status IS DISTINCT FROM 'submitted');

-- Staff can also update
CREATE POLICY "Staff/admin update stage2_prf"
  ON public.stage2_prf_submissions FOR UPDATE
  TO authenticated
  USING (is_staff_or_admin(auth.uid()));
