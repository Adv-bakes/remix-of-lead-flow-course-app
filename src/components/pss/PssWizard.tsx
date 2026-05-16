import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pencil, ArrowLeft, ArrowRight, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export interface PssData {
  header: {
    company_name?: string;
    customer_name?: string;
    product_name?: string;
    product_code?: string;
    date_of_issue?: string;
  };
  product: {
    target_unit_weight_raw?: string;
    target_unit_weight_raw_tbd?: boolean;
    target_unit_weight_baked?: string;
    weight_unit?: string;
    expected_bake_loss_pct?: string;
    unit_dimensions?: { l?: string; w?: string; h?: string; unit?: string };
    shape?: string;
    intended_use?: string;
    target_shelf_life?: string;
  };
  recipe: {
    total_batch_weight?: string;
    weight_unit?: string;
    ingredients: Array<{ name?: string; weight?: string; weight_unit?: string }>;
  };
  process: {
    method?: string;
    pre_bake: {
      dough_temp_target?: string;
      dough_temp_unit?: string;
      steps: Array<{
        action?: string;
        ingredients_added?: string;
        mix_time_min?: string;
        mix_speed?: string;
      }>;
    };
    forming?: { machine?: string; target_deposit_weight_raw?: string };
    bake: { temperature?: string; temp_unit?: string; time_minutes?: string };
    post_bake: { freeze_required?: boolean; freeze_temp?: string; freeze_time?: string };
  };
  packaging: {
    primary: {
      vessel?: string;
      units_per_pack?: string;
      net_weight_per_pack?: string;
      weight_unit?: string;
      machine?: string;
      lot_code_printed?: boolean;
    };
    secondary: { type?: string; units_per_case?: string; machine?: string; lot_code_printed?: boolean };
    palletizing: { cases_per_pallet?: string; pattern?: string };
  };
  optional_sections: {
    nutritional_panel?: string;
    allergens?: string;
    shelf_life?: string;
  };
}

const emptyData = (): PssData => ({
  header: {},
  product: { weight_unit: "g", unit_dimensions: { unit: "mm" } },
  recipe: { weight_unit: "g", ingredients: [{ name: "", weight: "" }] },
  process: {
    pre_bake: { dough_temp_unit: "°F", steps: [{ action: "" }] },
    bake: { temp_unit: "°F" },
    post_bake: { freeze_required: false },
  },
  packaging: { primary: {}, secondary: {}, palletizing: {} },
  optional_sections: {},
});

const PROCESS_METHODS = [
  "Bake",
  "No-bake (mix + deposit/shape, then pack)",
  "No-bake (mix + deposit/shape, freeze, then pack)",
  "Melt (jacketed kettle)",
  "Loose-batter (depositor)",
  "Dough-extruder + wire-cut",
  "Round former",
  "Press with die",
  "Manual",
  "Not determined yet",
];

const isNoBakeMethod = (m?: string) =>
  !!m && /^no-?bake/i.test(m.trim());

const STEPS = [
  { key: "header", label: "Company & product" },
  { key: "product", label: "Product specs" },
  { key: "recipe", label: "Recipe" },
  { key: "process", label: "Process" },
  { key: "packaging", label: "Packaging" },
  { key: "optional", label: "Optional sections" },
  { key: "review", label: "Review & submit" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export function PssWizard(props: {
  id: string;
  token: string;
  initialData: PssData;
  initialProductLabel: string;
  prefill?: { company_name?: string; customer_name?: string };
  onSubmitted: () => void;
}) {
  const [data, setData] = useState<PssData>(() => ({
    ...emptyData(),
    ...props.initialData,
    header: { ...emptyData().header, ...(props.prefill || {}), ...props.initialData.header },
  }));
  const [productLabel, setProductLabel] = useState(props.initialProductLabel || "");
  const [stepIdx, setStepIdx] = useState(0);
  const [returnToReview, setReturnToReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Autosave on data change.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      await (supabase as any).rpc("save_pss_draft_public", {
        _id: props.id,
        _token: props.token,
        _data: data,
        _product_label: productLabel || null,
      });
    }, 700);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [data, productLabel, props.id, props.token]);

  const step = STEPS[stepIdx];
  const update = (fn: (d: PssData) => PssData) => setData((prev) => fn(structuredClone(prev)));

  const goReview = () => setStepIdx(STEPS.length - 1);
  const goStep = (key: StepKey) => {
    setStepIdx(STEPS.findIndex((s) => s.key === key));
    setReturnToReview(true);
  };
  const returnToReviewBtn = returnToReview && step.key !== "review" && (
    <button
      onClick={() => { setReturnToReview(false); goReview(); }}
      className="tp-btn mb-4"
    >
      <ArrowLeft className="w-3.5 h-3.5" /> Return to review
    </button>
  );

  const recipePercentages = useMemo(() => {
    const ings = data.recipe.ingredients || [];
    const total = ings.reduce((s, i) => s + (parseFloat(i.weight || "0") || 0), 0);
    return { total, list: ings.map((i) => total > 0 ? ((parseFloat(i.weight || "0") || 0) / total) * 100 : 0) };
  }, [data.recipe.ingredients]);

  const validationErrors = useMemo(() => validatePss(data), [data]);

  const submit = async () => {
    if (validationErrors.length > 0) {
      toast.error("Please complete required fields before submitting");
      goReview();
      return;
    }
    setSubmitting(true);
    try {
      const { data: ok, error } = await (supabase as any).rpc("submit_pss_draft_public", {
        _id: props.id,
        _token: props.token,
        _data: data,
        _product_label: productLabel || null,
      });
      if (error || !ok) throw new Error(error?.message || "Submission failed");

      // Trigger finalize (PDF + email + advance stage).
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.functions.supabase.co/finalize-pss-submission`;
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: props.id, token: props.token }),
      });
      toast.success("PSS submitted — a copy is on its way to your inbox");
      props.onSubmitted();
    } catch (e: any) {
      toast.error(e?.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Progress chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => setStepIdx(i)}
            className={`tp-chip text-[11px] ${i === stepIdx ? "text-[hsl(var(--tp-gold))]" : ""}`}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {returnToReviewBtn}

      {/* STEP CONTENT */}
      {step.key === "header" && (
        <Section title="Company & product">
          <Field label="Product label (for your reference, e.g. flavor or SKU)">
            <input className="tp-input" value={productLabel} onChange={(e) => setProductLabel(e.target.value)} />
          </Field>
          <Field label="Company name">
            <input className="tp-input" value={data.header.company_name || ""} onChange={(e) => update((d) => (d.header.company_name = e.target.value, d))} />
          </Field>
          <Field label="Customer / contact name">
            <input className="tp-input" value={data.header.customer_name || ""} onChange={(e) => update((d) => (d.header.customer_name = e.target.value, d))} />
          </Field>
          <Field label="Product name">
            <input className="tp-input" value={data.header.product_name || ""} onChange={(e) => update((d) => (d.header.product_name = e.target.value, d))} />
          </Field>
          <Field label="Product code (optional)">
            <input className="tp-input" value={data.header.product_code || ""} onChange={(e) => update((d) => (d.header.product_code = e.target.value, d))} />
          </Field>
        </Section>
      )}

      {step.key === "product" && (
        <Section title="Product specs">
          <Row>
            <Field label="Target unit weight — raw">
              <input
                className="tp-input"
                disabled={!!data.product.target_unit_weight_raw_tbd}
                value={data.product.target_unit_weight_raw_tbd ? "" : (data.product.target_unit_weight_raw || "")}
                onChange={(e) => update((d) => (d.product.target_unit_weight_raw = e.target.value, d))}
              />
              <label className="flex items-center gap-2 text-[11px] mt-1 text-[hsl(var(--tp-text-dim))]">
                <input
                  type="checkbox"
                  checked={!!data.product.target_unit_weight_raw_tbd}
                  onChange={(e) => update((d) => {
                    d.product.target_unit_weight_raw_tbd = e.target.checked;
                    if (e.target.checked) d.product.target_unit_weight_raw = "TBD";
                    else if (d.product.target_unit_weight_raw === "TBD") d.product.target_unit_weight_raw = "";
                    return d;
                  })}
                />
                To be determined (TBD)
              </label>
            </Field>
            <Field label="Target unit weight — baked">
              <input className="tp-input" value={data.product.target_unit_weight_baked || ""} onChange={(e) => update((d) => (d.product.target_unit_weight_baked = e.target.value, d))} />
            </Field>
            <Field label="Weight unit">
              <select className="tp-input" value={data.product.weight_unit || "g"} onChange={(e) => update((d) => (d.product.weight_unit = e.target.value, d))}>
                {["g", "oz", "lb", "kg"].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </Row>
          <Field label="Expected bake loss %">
            <input className="tp-input" value={data.product.expected_bake_loss_pct || ""} onChange={(e) => update((d) => (d.product.expected_bake_loss_pct = e.target.value, d))} />
          </Field>
          <Row>
            <Field label="Length"><input className="tp-input" value={data.product.unit_dimensions?.l || ""} onChange={(e) => update((d) => ((d.product.unit_dimensions ||= {}).l = e.target.value, d))} /></Field>
            <Field label="Width"><input className="tp-input" value={data.product.unit_dimensions?.w || ""} onChange={(e) => update((d) => ((d.product.unit_dimensions ||= {}).w = e.target.value, d))} /></Field>
            <Field label="Height"><input className="tp-input" value={data.product.unit_dimensions?.h || ""} onChange={(e) => update((d) => ((d.product.unit_dimensions ||= {}).h = e.target.value, d))} /></Field>
            <Field label="Unit">
              <select className="tp-input" value={data.product.unit_dimensions?.unit || "mm"} onChange={(e) => update((d) => ((d.product.unit_dimensions ||= {}).unit = e.target.value, d))}>
                {["mm", "cm", "in"].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </Row>
          <Field label="Shape">
            <input className="tp-input" value={data.product.shape || ""} onChange={(e) => update((d) => (d.product.shape = e.target.value, d))} />
          </Field>
          <Field label="Intended use (snack, breakfast, ingredient…)">
            <input className="tp-input" value={data.product.intended_use || ""} onChange={(e) => update((d) => (d.product.intended_use = e.target.value, d))} />
          </Field>
          <Field label="Target shelf life">
            <input className="tp-input" value={data.product.target_shelf_life || ""} onChange={(e) => update((d) => (d.product.target_shelf_life = e.target.value, d))} />
          </Field>
        </Section>
      )}

      {step.key === "recipe" && (
        <Section title="Recipe">
          <p className="text-xs text-[hsl(var(--tp-text-dim))] mb-4">
            Enter ingredient weights per batch. Percentages are calculated automatically.
          </p>
          <Row>
            <Field label="Weight unit">
              <select className="tp-input" value={data.recipe.weight_unit || "g"} onChange={(e) => update((d) => (d.recipe.weight_unit = e.target.value, d))}>
                {["g", "oz", "lb", "kg"].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Declared total batch weight (optional — auto-summed if blank)">
              <input className="tp-input" value={data.recipe.total_batch_weight || ""} onChange={(e) => update((d) => (d.recipe.total_batch_weight = e.target.value, d))} />
            </Field>
          </Row>

          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
                <th className="py-2 pr-2">#</th>
                <th className="py-2 pr-2">Ingredient</th>
                <th className="py-2 pr-2 w-32">Weight</th>
                <th className="py-2 pr-2 w-24">%</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.recipe.ingredients.map((ing, i) => (
                <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                  <td className="py-2 pr-2 text-[hsl(var(--tp-text-dim))]">{i + 1}</td>
                  <td className="py-2 pr-2">
                    <input className="tp-input" value={ing.name || ""} onChange={(e) => update((d) => (d.recipe.ingredients[i].name = e.target.value, d))} />
                  </td>
                  <td className="py-2 pr-2">
                    <input className="tp-input" inputMode="decimal" value={ing.weight || ""} onChange={(e) => update((d) => (d.recipe.ingredients[i].weight = e.target.value, d))} />
                  </td>
                  <td className="py-2 pr-2 text-[hsl(var(--tp-text-dim))] text-xs">{recipePercentages.list[i]?.toFixed(2)}%</td>
                  <td className="py-2 text-right">
                    <button className="tp-btn" onClick={() => update((d) => (d.recipe.ingredients.splice(i, 1), d))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[hsl(var(--tp-hairline))]">
                <td colSpan={2} className="py-2 text-xs text-[hsl(var(--tp-text-dim))]">Total (auto)</td>
                <td className="py-2 text-sm">{recipePercentages.total.toFixed(2)}</td>
                <td className="py-2 text-xs text-[hsl(var(--tp-text-dim))]">100.00%</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          <button className="tp-btn mt-3" onClick={() => update((d) => (d.recipe.ingredients.push({ name: "", weight: "" }), d))}>
            <Plus className="w-3.5 h-3.5" /> Add ingredient
          </button>
        </Section>
      )}

      {step.key === "process" && (
        <Section title="Process">
          <Field label="Method">
            <select className="tp-input" value={data.process.method || ""} onChange={(e) => update((d) => (d.process.method = e.target.value, d))}>
              <option value="">— select —</option>
              {PROCESS_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Row>
            <Field label="Dough temp target">
              <input className="tp-input" value={data.process.pre_bake.dough_temp_target || ""} onChange={(e) => update((d) => (d.process.pre_bake.dough_temp_target = e.target.value, d))} />
            </Field>
            <Field label="Temp unit">
              <select className="tp-input" value={data.process.pre_bake.dough_temp_unit || "°F"} onChange={(e) => update((d) => (d.process.pre_bake.dough_temp_unit = e.target.value, d))}>
                {["°F", "°C"].map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
          </Row>

          <h3 className="font-display text-sm font-semibold mt-6 mb-2">Mix / pre-bake steps</h3>
          {data.process.pre_bake.steps.map((s, i) => (
            <div key={i} className="border border-[hsl(var(--tp-hairline))] rounded p-3 mb-2">
              <Row>
                <Field label={`Step ${i + 1} — action`}>
                  <input className="tp-input" value={s.action || ""} onChange={(e) => update((d) => (d.process.pre_bake.steps[i].action = e.target.value, d))} />
                </Field>
                <Field label="Mix time (min)">
                  <input className="tp-input" inputMode="decimal" value={s.mix_time_min || ""} onChange={(e) => update((d) => (d.process.pre_bake.steps[i].mix_time_min = e.target.value, d))} />
                </Field>
                <Field label="Speed">
                  <input className="tp-input" value={s.mix_speed || ""} onChange={(e) => update((d) => (d.process.pre_bake.steps[i].mix_speed = e.target.value, d))} />
                </Field>
              </Row>
              <Field label="Ingredients added at this step (comma-separated)">
                <input className="tp-input" value={s.ingredients_added || ""} onChange={(e) => update((d) => (d.process.pre_bake.steps[i].ingredients_added = e.target.value, d))} />
              </Field>
              <button className="tp-btn mt-2" onClick={() => update((d) => (d.process.pre_bake.steps.splice(i, 1), d))}>
                <Trash2 className="w-3.5 h-3.5" /> Remove step
              </button>
            </div>
          ))}
          <button className="tp-btn mb-6" onClick={() => update((d) => (d.process.pre_bake.steps.push({ action: "" }), d))}>
            <Plus className="w-3.5 h-3.5" /> Add step
          </button>

          {!isNoBakeMethod(data.process.method) && (
            <>
              <h3 className="font-display text-sm font-semibold mt-2 mb-2">Bake</h3>
              <Row>
                <Field label="Bake temperature">
                  <input className="tp-input" value={data.process.bake.temperature || ""} onChange={(e) => update((d) => (d.process.bake.temperature = e.target.value, d))} />
                </Field>
                <Field label="Unit">
                  <select className="tp-input" value={data.process.bake.temp_unit || "°F"} onChange={(e) => update((d) => (d.process.bake.temp_unit = e.target.value, d))}>
                    {["°F", "°C"].map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Bake time (min)">
                  <input className="tp-input" value={data.process.bake.time_minutes || ""} onChange={(e) => update((d) => (d.process.bake.time_minutes = e.target.value, d))} />
                </Field>
              </Row>
            </>
          )}

          <h3 className="font-display text-sm font-semibold mt-6 mb-2">Post-bake</h3>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!data.process.post_bake.freeze_required} onChange={(e) => update((d) => (d.process.post_bake.freeze_required = e.target.checked, d))} />
            Freeze before packaging
          </label>
          {data.process.post_bake.freeze_required && (
            <Row>
              <Field label="Freeze temp"><input className="tp-input" value={data.process.post_bake.freeze_temp || ""} onChange={(e) => update((d) => (d.process.post_bake.freeze_temp = e.target.value, d))} /></Field>
              <Field label="Freeze time"><input className="tp-input" value={data.process.post_bake.freeze_time || ""} onChange={(e) => update((d) => (d.process.post_bake.freeze_time = e.target.value, d))} /></Field>
            </Row>
          )}
        </Section>
      )}

      {step.key === "packaging" && (
        <Section title="Packaging">
          <h3 className="font-display text-sm font-semibold mb-2">Primary (retail unit)</h3>
          <Row>
            <Field label="Vessel"><input className="tp-input" value={data.packaging.primary.vessel || ""} onChange={(e) => update((d) => (d.packaging.primary.vessel = e.target.value, d))} /></Field>
            <Field label="Units per pack"><input className="tp-input" value={data.packaging.primary.units_per_pack || ""} onChange={(e) => update((d) => (d.packaging.primary.units_per_pack = e.target.value, d))} /></Field>
            <Field label="Net weight per pack"><input className="tp-input" value={data.packaging.primary.net_weight_per_pack || ""} onChange={(e) => update((d) => (d.packaging.primary.net_weight_per_pack = e.target.value, d))} /></Field>
          </Row>
          <Field label="Packaging machine"><input className="tp-input" value={data.packaging.primary.machine || ""} onChange={(e) => update((d) => (d.packaging.primary.machine = e.target.value, d))} /></Field>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={!!data.packaging.primary.lot_code_printed} onChange={(e) => update((d) => (d.packaging.primary.lot_code_printed = e.target.checked, d))} />
            Lot code printed on retail unit
          </label>

          <h3 className="font-display text-sm font-semibold mt-6 mb-2">Secondary (case)</h3>
          <Row>
            <Field label="Case type"><input className="tp-input" value={data.packaging.secondary.type || ""} onChange={(e) => update((d) => (d.packaging.secondary.type = e.target.value, d))} /></Field>
            <Field label="Units per case"><input className="tp-input" value={data.packaging.secondary.units_per_case || ""} onChange={(e) => update((d) => (d.packaging.secondary.units_per_case = e.target.value, d))} /></Field>
            <Field label="Case-pack machine"><input className="tp-input" value={data.packaging.secondary.machine || ""} onChange={(e) => update((d) => (d.packaging.secondary.machine = e.target.value, d))} /></Field>
          </Row>
          <label className="flex items-center gap-2 text-sm mt-2">
            <input type="checkbox" checked={!!data.packaging.secondary.lot_code_printed} onChange={(e) => update((d) => (d.packaging.secondary.lot_code_printed = e.target.checked, d))} />
            Lot code printed on shipper case
          </label>

          <h3 className="font-display text-sm font-semibold mt-6 mb-2">Palletizing</h3>
          <Row>
            <Field label="Cases per pallet"><input className="tp-input" value={data.packaging.palletizing.cases_per_pallet || ""} onChange={(e) => update((d) => (d.packaging.palletizing.cases_per_pallet = e.target.value, d))} /></Field>
            <Field label="Pallet pattern"><input className="tp-input" value={data.packaging.palletizing.pattern || ""} onChange={(e) => update((d) => (d.packaging.palletizing.pattern = e.target.value, d))} /></Field>
          </Row>
        </Section>
      )}

      {step.key === "optional" && (
        <Section title="Optional sections (skip if unknown)">
          <Field label="Nutritional panel notes"><textarea className="tp-input min-h-24" value={data.optional_sections.nutritional_panel || ""} onChange={(e) => update((d) => (d.optional_sections.nutritional_panel = e.target.value, d))} /></Field>
          <Field label="Allergens"><textarea className="tp-input min-h-24" value={data.optional_sections.allergens || ""} onChange={(e) => update((d) => (d.optional_sections.allergens = e.target.value, d))} /></Field>
          <Field label="Shelf-life data"><textarea className="tp-input min-h-24" value={data.optional_sections.shelf_life || ""} onChange={(e) => update((d) => (d.optional_sections.shelf_life = e.target.value, d))} /></Field>
        </Section>
      )}

      {step.key === "review" && (
        <Section title="Review & submit">
          <p className="text-xs text-[hsl(var(--tp-text-dim))] mb-4">
            Click the pencil to edit any section. We'll bring you right back here after.
          </p>

          <ReviewBlock title="Company & product" onEdit={() => goStep("header")}>
            <Kv k="Product label" v={productLabel} />
            <Kv k="Company" v={data.header.company_name} />
            <Kv k="Contact" v={data.header.customer_name} />
            <Kv k="Product name" v={data.header.product_name} />
            <Kv k="Product code" v={data.header.product_code} />
          </ReviewBlock>

          <ReviewBlock title="Product specs" onEdit={() => goStep("product")}>
            <Kv k="Target raw weight" v={joinUnit(data.product.target_unit_weight_raw, data.product.weight_unit)} />
            <Kv k="Target baked weight" v={joinUnit(data.product.target_unit_weight_baked, data.product.weight_unit)} />
            <Kv k="Bake loss %" v={data.product.expected_bake_loss_pct} />
            <Kv k="Shape" v={data.product.shape} />
            <Kv k="Intended use" v={data.product.intended_use} />
            <Kv k="Target shelf life" v={data.product.target_shelf_life} />
          </ReviewBlock>

          <ReviewBlock title={`Recipe (${data.recipe.ingredients.length} ingredients, Σ ${recipePercentages.total.toFixed(2)} ${data.recipe.weight_unit})`} onEdit={() => goStep("recipe")}>
            {data.recipe.ingredients.map((ing, i) => (
              <Kv key={i} k={`${i + 1}. ${ing.name || "(unnamed)"}`} v={`${ing.weight || "—"} ${data.recipe.weight_unit} · ${recipePercentages.list[i]?.toFixed(2)}%`} />
            ))}
          </ReviewBlock>

          <ReviewBlock title="Process" onEdit={() => goStep("process")}>
            <Kv k="Method" v={data.process.method} />
            <Kv k="Dough temp target" v={joinUnit(data.process.pre_bake.dough_temp_target, data.process.pre_bake.dough_temp_unit)} />
            <Kv k="Bake" v={`${joinUnit(data.process.bake.temperature, data.process.bake.temp_unit) || "—"} · ${data.process.bake.time_minutes || "—"} min`} />
            <Kv k="Post-bake freeze" v={data.process.post_bake.freeze_required ? "Yes" : "No"} />
            <Kv k="Steps" v={`${data.process.pre_bake.steps.length}`} />
          </ReviewBlock>

          <ReviewBlock title="Packaging" onEdit={() => goStep("packaging")}>
            <Kv k="Retail vessel" v={data.packaging.primary.vessel} />
            <Kv k="Units / pack" v={data.packaging.primary.units_per_pack} />
            <Kv k="Lot code on retail" v={data.packaging.primary.lot_code_printed ? "Yes" : "No"} />
            <Kv k="Case type" v={data.packaging.secondary.type} />
            <Kv k="Units / case" v={data.packaging.secondary.units_per_case} />
            <Kv k="Cases / pallet" v={data.packaging.palletizing.cases_per_pallet} />
          </ReviewBlock>

          <ReviewBlock title="Optional sections" onEdit={() => goStep("optional")}>
            <Kv k="Nutritionals" v={data.optional_sections.nutritional_panel ? "Provided" : "—"} />
            <Kv k="Allergens" v={data.optional_sections.allergens ? "Provided" : "—"} />
            <Kv k="Shelf life" v={data.optional_sections.shelf_life ? "Provided" : "—"} />
          </ReviewBlock>

          {validationErrors.length > 0 && (
            <div className="mt-6 border border-[hsl(var(--tp-warning))]/40 bg-[hsl(var(--tp-warning))]/5 p-4 rounded">
              <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-warning))] mb-2">
                Please complete before submitting
              </p>
              <ul className="text-xs text-[hsl(var(--tp-text))] list-disc list-inside space-y-0.5">
                {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-8 flex items-center justify-end gap-3">
            <button
              className="tp-btn tp-btn-primary disabled:opacity-50"
              onClick={submit}
              disabled={submitting || validationErrors.length > 0}
              title={validationErrors.length > 0 ? "Resolve required fields above" : ""}
            >
              <CheckCircle2 className="w-4 h-4" /> {submitting ? "Submitting…" : "Submit PSS"}
            </button>
          </div>
        </Section>
      )}

      {/* Navigation */}
      {step.key !== "review" && (
        <div className="mt-8 flex items-center justify-between gap-3">
          <button className="tp-btn" disabled={stepIdx === 0} onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <p className="text-[11px] text-[hsl(var(--tp-text-dim))]">Auto-saved. You can close this tab and come back any time.</p>
          <button className="tp-btn tp-btn-primary" onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}>
            Next <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="tp-surface p-6">
    <h2 className="font-display text-base font-semibold mb-4 text-[hsl(var(--tp-text))]">{title}</h2>
    {children}
  </div>
);

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{children}</div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block mb-3">
    <span className="block text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">{label}</span>
    {children}
  </label>
);

const ReviewBlock = ({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) => (
  <div className="border-t border-[hsl(var(--tp-hairline))] py-4">
    <div className="flex items-center justify-between mb-2">
      <h3 className="font-display text-sm font-semibold text-[hsl(var(--tp-text))]">{title}</h3>
      <button onClick={onEdit} className="tp-btn"><Pencil className="w-3.5 h-3.5" /> Edit</button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{children}</div>
  </div>
);

const Kv = ({ k, v }: { k: string; v: any }) => (
  <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
    <span className="text-[hsl(var(--tp-text-dim))] text-xs">{k}</span>
    <span className="text-[hsl(var(--tp-text))] text-right truncate">{v || "—"}</span>
  </div>
);

function joinUnit(v?: string, u?: string) {
  if (!v) return "";
  return u ? `${v} ${u}` : v;
}

function validatePss(d: PssData): string[] {
  const errors: string[] = [];
  const need = (cond: any, label: string) => { if (!cond) errors.push(label); };

  // Identity
  need(d.header.company_name?.trim(), "Company name");
  need(d.header.customer_name?.trim(), "Customer / contact name");
  need(d.header.product_name?.trim(), "Product name");

  // Product (raw weight may be TBD)
  need(
    d.product.target_unit_weight_raw_tbd || d.product.target_unit_weight_raw?.trim(),
    "Target unit weight (raw) — or check TBD",
  );
  need(d.product.shape?.trim(), "Shape");
  need(d.product.intended_use?.trim(), "Intended use");
  need(d.product.target_shelf_life?.trim(), "Target shelf life");

  // Recipe
  const ings = (d.recipe.ingredients || []).filter((i) => i.name?.trim() && i.weight?.trim());
  need(ings.length > 0, "At least one ingredient with name and weight");

  // Process
  need(d.process.method?.trim(), "Process method");
  const steps = (d.process.pre_bake?.steps || []).filter((s) => s.action?.trim());
  need(steps.length > 0, "At least one process step");

  // Bake fields only required when method is not no-bake / not TBD
  const m = d.process.method || "";
  const noBake = /^no-?bake/i.test(m.trim());
  const tbdMethod = m === "Not determined yet";
  if (!noBake && !tbdMethod && m) {
    need(d.process.bake?.temperature?.toString().trim(), "Bake temperature");
    need(d.process.bake?.time_minutes?.toString().trim(), "Bake time (min)");
  }

  // Packaging — require primary unless user marks packaging as TBD via Adventure Bakery placeholder
  const p = d.packaging.primary || {};
  const packagingTbd = (p.vessel || "").toLowerCase().includes("tbd")
    || (p.vessel || "").toLowerCase().includes("adventure bakery");
  if (!packagingTbd) {
    need(p.vessel?.trim(), "Primary packaging vessel (or note Adventure Bakery to design)");
    need(p.units_per_pack?.toString().trim(), "Units per pack");
    need(p.net_weight_per_pack?.toString().trim(), "Net weight per pack");
  }

  return errors;
}
