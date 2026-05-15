-- Inventory: JIT
CREATE TABLE public.inventory_jit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_name text NOT NULL,
  unit text NOT NULL DEFAULT 'lbs',
  cases_on_hand numeric NOT NULL DEFAULT 0,
  lbs_per_case numeric NOT NULL DEFAULT 0,
  total_lbs numeric GENERATED ALWAYS AS (cases_on_hand * lbs_per_case) STORED,
  reorder_point numeric DEFAULT 0,
  supplier text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_jit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/admin all inventory_jit" ON public.inventory_jit
  FOR ALL TO authenticated USING (is_staff_or_admin(auth.uid())) WITH CHECK (is_staff_or_admin(auth.uid()));

-- Inventory: Tolling
CREATE TABLE public.inventory_tolling (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid,
  client_name text,
  ingredient_name text NOT NULL,
  unit text NOT NULL DEFAULT 'lbs',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  lot_code text,
  received_date date,
  expiry_date date,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_tolling ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/admin all inventory_tolling" ON public.inventory_tolling
  FOR ALL TO authenticated USING (is_staff_or_admin(auth.uid())) WITH CHECK (is_staff_or_admin(auth.uid()));

-- Production batches
CREATE TABLE public.production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text,
  product_name text NOT NULL,
  batch_date date NOT NULL DEFAULT CURRENT_DATE,
  lot_code text NOT NULL UNIQUE,
  target_batch_size_lbs numeric NOT NULL CHECK (target_batch_size_lbs > 0 AND target_batch_size_lbs <= 110),
  status text NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','In Progress','Complete','On Hold')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/admin all production_batches" ON public.production_batches
  FOR ALL TO authenticated USING (is_staff_or_admin(auth.uid())) WITH CHECK (is_staff_or_admin(auth.uid()));

-- Production batch ingredients
CREATE TABLE public.production_batch_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  ingredient_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('JIT','Tolling')),
  lot_code_used text,
  qty_planned_lbs numeric NOT NULL DEFAULT 0,
  qty_actual_lbs numeric NOT NULL DEFAULT 0,
  variance_lbs numeric GENERATED ALWAYS AS (qty_actual_lbs - qty_planned_lbs) STORED,
  deducted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.production_batch_ingredients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff/admin all batch_ingredients" ON public.production_batch_ingredients
  FOR ALL TO authenticated USING (is_staff_or_admin(auth.uid())) WITH CHECK (is_staff_or_admin(auth.uid()));

CREATE INDEX idx_batch_ingredients_batch ON public.production_batch_ingredients(batch_id);
CREATE INDEX idx_batches_status ON public.production_batches(status);
CREATE INDEX idx_batches_date ON public.production_batches(batch_date DESC);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_jit_touch BEFORE UPDATE ON public.inventory_jit
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_tolling_touch BEFORE UPDATE ON public.inventory_tolling
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_batches_touch BEFORE UPDATE ON public.production_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Complete batch RPC: marks complete + deducts inventory atomically
CREATE OR REPLACE FUNCTION public.complete_batch(_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NOT is_staff_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  FOR r IN
    SELECT id, ingredient_name, type, lot_code_used, qty_actual_lbs, deducted
    FROM public.production_batch_ingredients
    WHERE batch_id = _batch_id AND deducted = false AND qty_actual_lbs > 0
  LOOP
    IF r.type = 'JIT' THEN
      UPDATE public.inventory_jit
      SET cases_on_hand = GREATEST(0, cases_on_hand - (r.qty_actual_lbs / NULLIF(lbs_per_case,0)))
      WHERE lower(ingredient_name) = lower(r.ingredient_name);
    ELSIF r.type = 'Tolling' THEN
      UPDATE public.inventory_tolling
      SET qty_on_hand = GREATEST(0, qty_on_hand - r.qty_actual_lbs)
      WHERE lower(ingredient_name) = lower(r.ingredient_name)
        AND (r.lot_code_used IS NULL OR lot_code = r.lot_code_used);
    END IF;

    UPDATE public.production_batch_ingredients SET deducted = true WHERE id = r.id;
  END LOOP;

  UPDATE public.production_batches
  SET status = 'Complete', completed_at = now()
  WHERE id = _batch_id;
END $$;