import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Save, Download, RefreshCw, Plus, Trash2 } from "lucide-react";

/**
 * Editable in-app preview of a PSS — always renders the full AB template,
 * even when fields are blank, so staff and clients can fill in missing data.
 *
 * Field-name contract: anything the Sourcing Bot reads stays the same key
 * (header.*, product.*, recipe.ingredients[*].name/weight/weight_unit/percentage,
 * packaging.*). New sections are added as additive sub-keys.
 */

type Ing = {
  name?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  percentage?: number | null;
  source?: string | null;       // PSS section 8 — supplier / origin
  grade?: string | null;        // PSS section 8 — spec / grade
  function?: string | null;     // PSS section 8 — role in formula
  notes?: string | null;
};

type Extracted = {
  header?: any;
  product?: any;
  recipe?: { ingredients?: Ing[] };
  packaging?: { primary?: any; secondary?: any; palletizing?: any };
  nutrition?: { rows?: { nutrient: string; amount?: string; dv?: string }[]; serving_size?: string };
  allergens?: Record<string, { present?: boolean; source?: string }>;
  qc?: any;
  certifications?: Record<string, boolean | string>;
  storage?: any;
  document_history?: { version?: string; date?: string; changes?: string; approved_by?: string }[];
  client_process_steps?: { step: number; text: string }[];
};

const NUTRIENT_ROWS = [
  "Calories", "Total Fat", "Saturated Fat", "Trans Fat",
  "Cholesterol", "Sodium", "Total Carbohydrate", "Dietary Fiber",
  "Total Sugars", "Added Sugars", "Protein",
];

const ALLERGEN_KEYS = ["Milk", "Eggs", "Tree nuts", "Peanuts", "Wheat / Gluten", "Soy", "Sesame", "Fish", "Shellfish"];

const CERT_KEYS = ["Kosher", "Gluten-Free", "Organic", "Non-GMO", "Halal", "Vegan", "None"];

export function PssPreviewDrawer({
  pssDocumentId,
  onClose,
  onSaved,
}: {
  pssDocumentId: string | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [doc, setDoc] = useState<any>(null);
  const [data, setData] = useState<Extracted>({});

  const hydrate = (d: any): Extracted => {
    const ex: Extracted = (d?.review_notes?.extracted as any) || {};
    return {
      header: ex.header || {},
      product: { ...(ex.product || {}), unit_dimensions: ex.product?.unit_dimensions || {} },
      recipe: { ...(ex.recipe || {}), ingredients: ex.recipe?.ingredients || [] },
      packaging: {
        primary: ex.packaging?.primary || {},
        secondary: ex.packaging?.secondary || {},
        palletizing: ex.packaging?.palletizing || {},
      },
      nutrition: {
        serving_size: ex.nutrition?.serving_size || "",
        rows: ex.nutrition?.rows && ex.nutrition.rows.length
          ? ex.nutrition.rows
          : NUTRIENT_ROWS.map((n) => ({ nutrient: n, amount: "", dv: "" })),
      },
      allergens: ex.allergens || {},
      qc: ex.qc || {},
      certifications: ex.certifications || {},
      storage: ex.storage || {},
      document_history: ex.document_history && ex.document_history.length
        ? ex.document_history
        : [{ version: "", date: "", changes: "", approved_by: "" }],
      client_process_steps: ex.client_process_steps && ex.client_process_steps.length
        ? ex.client_process_steps
        : Array.from({ length: 8 }, (_, i) => ({ step: i + 1, text: "" })),
    };
  };

  useEffect(() => {
    if (!pssDocumentId) return;
    (async () => {
      setLoading(true);
      const { data: d, error } = await (supabase as any)
        .from("client_documents").select("*").eq("id", pssDocumentId).maybeSingle();
      if (error) toast.error(error.message);
      setDoc(d);
      setData(hydrate(d));
      setLoading(false);
    })();
  }, [pssDocumentId]);

  if (!pssDocumentId) return null;

  const update = (path: string[], value: any) => {
    setData((prev) => {
      const next: any = { ...prev };
      let cur = next;
      for (let i = 0; i < path.length - 1; i++) {
        cur[path[i]] = { ...(cur[path[i]] || {}) };
        cur = cur[path[i]];
      }
      cur[path[path.length - 1]] = value;
      return next;
    });
  };

  const updateIngredient = (i: number, key: keyof Ing, value: any) => {
    setData((prev) => {
      const ings = [...(prev.recipe?.ingredients || [])];
      ings[i] = { ...(ings[i] || {}), [key]: value };
      return { ...prev, recipe: { ...(prev.recipe || {}), ingredients: ings } };
    });
  };
  const addIngredient = () => {
    setData((prev) => ({
      ...prev,
      recipe: {
        ...(prev.recipe || {}),
        ingredients: [...(prev.recipe?.ingredients || []), { name: "", weight: null, percentage: null }],
      },
    }));
  };
  const removeIngredient = (i: number) => {
    setData((prev) => {
      const ings = [...(prev.recipe?.ingredients || [])];
      ings.splice(i, 1);
      return { ...prev, recipe: { ...(prev.recipe || {}), ingredients: ings } };
    });
  };

  const updateNutrition = (i: number, key: "amount" | "dv", value: string) => {
    setData((prev) => {
      const rows = [...(prev.nutrition?.rows || [])];
      rows[i] = { ...(rows[i] || { nutrient: "" }), [key]: value };
      return { ...prev, nutrition: { ...(prev.nutrition || {}), rows } };
    });
  };

  const updateAllergen = (key: string, patch: { present?: boolean; source?: string }) => {
    setData((prev) => ({
      ...prev,
      allergens: { ...(prev.allergens || {}), [key]: { ...((prev.allergens || {})[key] || {}), ...patch } },
    }));
  };

  const updateCert = (key: string, present: boolean) => {
    setData((prev) => ({ ...prev, certifications: { ...(prev.certifications || {}), [key]: present } }));
  };

  const updateHistory = (i: number, key: string, value: string) => {
    setData((prev) => {
      const hist = [...(prev.document_history || [])];
      hist[i] = { ...(hist[i] || {}), [key]: value };
      return { ...prev, document_history: hist };
    });
  };
  const addHistory = () => setData((p) => ({ ...p, document_history: [...(p.document_history || []), { version: "", date: "", changes: "", approved_by: "" }] }));

  const downloadOriginal = async () => {
    if (!doc?.file_path) return toast.error("No file on record");
    const { data: u, error } = await supabase.storage
      .from("product-spec-sheets").createSignedUrl(doc.file_path, 600);
    if (error || !u?.signedUrl) return toast.error("Could not generate link");
    window.open(u.signedUrl, "_blank");
  };

  const save = async () => {
    if (!doc) return;
    setSaving(true);
    const newNotes = { ...(doc.review_notes || {}), extracted: data };
    const { error } = await (supabase as any)
      .from("client_documents").update({ review_notes: newNotes }).eq("id", doc.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("PSS saved");
    setDoc({ ...doc, review_notes: newNotes });
    onSaved?.();
    syncWithBatchSheet(true);
  };

  const syncWithBatchSheet = async (silent = false) => {
    if (!doc) return;
    setSyncing(true);
    const { data: res, error } = await supabase.functions.invoke("reconcile-pss-batch", {
      body: { pss_document_id: doc.id },
    });
    setSyncing(false);
    if (error) {
      if (!silent) toast.error(error.message || "Sync failed");
      return;
    }
    const filled = (res as any)?.filled || {};
    const total = (filled.pss_filled_count || 0) + (filled.batch_filled_count || 0);
    if (total > 0) {
      toast.success(`Synced: filled ${filled.pss_filled_count || 0} PSS field(s), ${filled.batch_filled_count || 0} batch sheet field(s).`);
      const { data: d } = await (supabase as any)
        .from("client_documents").select("*").eq("id", doc.id).maybeSingle();
      if (d) { setDoc(d); setData(hydrate(d)); }
      onSaved?.();
    } else if (!silent) {
      toast.info("Nothing to sync — both sides already aligned.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 team-portal" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full max-w-[820px] tp-surface border-l border-[hsl(var(--tp-hairline))] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--tp-hairline))] bg-[hsl(var(--tp-surface))]/95 backdrop-blur">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-gold))]">
              Product Spec Sheet · {doc?.review_status || "—"}
            </p>
            <h2 className="font-display text-lg text-[hsl(var(--tp-text))]">
              {data.header?.product_name || doc?.file_name || "PSS"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => syncWithBatchSheet(false)} className="tp-btn" disabled={syncing} title="Fill blanks from the batch sheet, and vice versa">
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync
            </button>
            <button onClick={downloadOriginal} className="tp-btn" title="Download original file">
              <Download className="w-3.5 h-3.5" /> Original
            </button>
            <button onClick={save} disabled={saving || loading} className="tp-btn tp-btn-primary">
              <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="tp-btn"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-sm text-[hsl(var(--tp-text-dim))]">Loading…</div>
        ) : (
          <div className="p-6 space-y-6">

            <Section title="Header">
              <TextField label="Company" v={data.header?.company_name} onChange={(v) => update(["header", "company_name"], v)} />
              <TextField label="Customer" v={data.header?.customer_name} onChange={(v) => update(["header", "customer_name"], v)} />
              <TextField label="Product name" v={data.header?.product_name} onChange={(v) => update(["header", "product_name"], v)} />
              <TextField label="Product code" v={data.header?.product_code} onChange={(v) => update(["header", "product_code"], v)} />
              <TextField label="Version" v={data.header?.version_number} onChange={(v) => update(["header", "version_number"], v)} />
              <TextField label="Date of issue" v={data.header?.date_of_issue} onChange={(v) => update(["header", "date_of_issue"], v)} />
              <TextField label="Prepared by" v={data.header?.prepared_by} onChange={(v) => update(["header", "prepared_by"], v)} />
              <TextField label="Approved by" v={data.header?.approved_by} onChange={(v) => update(["header", "approved_by"], v)} />
            </Section>

            <Section title="1 · Product description">
              <TextField label="Category" v={data.product?.category} onChange={(v) => update(["product", "category"], v)} />
              <TextField label="Shape" v={data.product?.shape} onChange={(v) => update(["product", "shape"], v)} />
              <TextField label="Target unit weight (raw)" v={data.product?.target_unit_weight_raw} onChange={(v) => update(["product", "target_unit_weight_raw"], num(v))} type="number" />
              <TextField label="Weight unit" v={data.product?.weight_unit} onChange={(v) => update(["product", "weight_unit"], v)} />
              <TextField label="Target shelf life" v={data.product?.target_shelf_life} onChange={(v) => update(["product", "target_shelf_life"], v)} />
              <TextField label="Intended use" v={data.product?.intended_use} onChange={(v) => update(["product", "intended_use"], v)} />
              <TextAreaField className="col-span-2" label="Appearance" v={data.product?.appearance} onChange={(v) => update(["product", "appearance"], v)} />
              <TextAreaField className="col-span-2" label="Texture / mouthfeel" v={data.product?.texture} onChange={(v) => update(["product", "texture"], v)} />
              <TextAreaField className="col-span-2" label="Description / key qualities" v={data.product?.description} onChange={(v) => update(["product", "description"], v)} />
            </Section>

            <Section title="2 · Nutrition Facts (per serving)">
              <TextField label="Serving size" v={data.nutrition?.serving_size} onChange={(v) => update(["nutrition", "serving_size"], v)} />
              <div />
              <div className="col-span-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
                    <tr><th className="text-left py-1">Nutrient</th><th className="text-left">Amount</th><th className="text-left">% DV</th></tr>
                  </thead>
                  <tbody>
                    {(data.nutrition?.rows || []).map((r, i) => (
                      <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                        <td className="py-1 pr-2 text-[hsl(var(--tp-text))]">{r.nutrient}</td>
                        <td className="py-1 pr-2"><input className="tp-input w-full" value={r.amount || ""} onChange={(e) => updateNutrition(i, "amount", e.target.value)} /></td>
                        <td className="py-1"><input className="tp-input w-full" value={r.dv || ""} onChange={(e) => updateNutrition(i, "dv", e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="3 · Allergen declaration">
              <div className="col-span-2 grid grid-cols-1 gap-2">
                {ALLERGEN_KEYS.map((key) => {
                  const a = data.allergens?.[key] || {};
                  return (
                    <div key={key} className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-xs text-[hsl(var(--tp-text))]">{key}</span>
                      <label className="col-span-2 flex items-center gap-1 text-xs text-[hsl(var(--tp-text-dim))]">
                        <input type="checkbox" checked={!!a.present} onChange={(e) => updateAllergen(key, { present: e.target.checked })} />
                        Contains
                      </label>
                      <input className="tp-input col-span-7" placeholder="Source / ingredient" value={a.source || ""} onChange={(e) => updateAllergen(key, { source: e.target.value })} />
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section title="4 · Packaging">
              <TextField label="Primary vessel" v={data.packaging?.primary?.vessel} onChange={(v) => update(["packaging", "primary", "vessel"], v)} />
              <TextField label="Units / primary pack" v={data.packaging?.primary?.units_per_pack} onChange={(v) => update(["packaging", "primary", "units_per_pack"], num(v))} type="number" />
              <TextField label="Net weight / pack" v={data.packaging?.primary?.net_weight_per_pack} onChange={(v) => update(["packaging", "primary", "net_weight_per_pack"], num(v))} type="number" />
              <TextField label="Pack weight unit" v={data.packaging?.primary?.weight_unit} onChange={(v) => update(["packaging", "primary", "weight_unit"], v)} />
              <TextField label="Secondary type (case/caddy/shipper)" v={data.packaging?.secondary?.type} onChange={(v) => update(["packaging", "secondary", "type"], v)} />
              <TextField label="Units / case" v={data.packaging?.secondary?.units_per_case} onChange={(v) => update(["packaging", "secondary", "units_per_case"], num(v))} type="number" />
              <TextField label="Cases / pallet" v={data.packaging?.palletizing?.cases_per_pallet} onChange={(v) => update(["packaging", "palletizing", "cases_per_pallet"], num(v))} type="number" />
              <TextAreaField className="col-span-2" label="Label / regulatory requirements" v={data.packaging?.primary?.label_requirements} onChange={(v) => update(["packaging", "primary", "label_requirements"], v)} />
            </Section>

            <Section title="5 · Storage & shelf life">
              <TextField label="Storage temperature" v={data.storage?.temperature} onChange={(v) => update(["storage", "temperature"], v)} />
              <TextField label="Humidity" v={data.storage?.humidity} onChange={(v) => update(["storage", "humidity"], v)} />
              <TextField label="Shelf life (ambient)" v={data.storage?.shelf_life_ambient} onChange={(v) => update(["storage", "shelf_life_ambient"], v)} />
              <TextField label="Shelf life (frozen)" v={data.storage?.shelf_life_frozen} onChange={(v) => update(["storage", "shelf_life_frozen"], v)} />
            </Section>

            <Section title="6 · QC specifications">
              <TextField label="Target weight" v={data.qc?.target_weight} onChange={(v) => update(["qc", "target_weight"], v)} />
              <TextField label="Weight tolerance" v={data.qc?.weight_tolerance} onChange={(v) => update(["qc", "weight_tolerance"], v)} />
              <TextField label="Dimensions (L × W × H)" v={data.qc?.dimensions} onChange={(v) => update(["qc", "dimensions"], v)} />
              <TextField label="Color" v={data.qc?.color} onChange={(v) => update(["qc", "color"], v)} />
              <TextField label="Moisture (%)" v={data.qc?.moisture} onChange={(v) => update(["qc", "moisture"], v)} />
              <TextField label="pH / Aw" v={data.qc?.ph_aw} onChange={(v) => update(["qc", "ph_aw"], v)} />
              <TextAreaField className="col-span-2" label="Microbiological limits" v={data.qc?.micro_limits} onChange={(v) => update(["qc", "micro_limits"], v)} />
            </Section>

            <Section title="7 · Certifications & claims">
              <div className="col-span-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                {CERT_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs text-[hsl(var(--tp-text))]">
                    <input type="checkbox" checked={!!data.certifications?.[k]} onChange={(e) => updateCert(k, e.target.checked)} />
                    {k}
                  </label>
                ))}
              </div>
            </Section>

            <Section
              title={`8 · Ingredients (${data.recipe?.ingredients?.length || 0})`}
              action={<button onClick={addIngredient} className="tp-btn text-[11px]"><Plus className="w-3 h-3" /> Add row</button>}
            >
              <div className="col-span-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
                    <tr>
                      <th className="text-left py-1">Ingredient</th>
                      <th className="text-right">%</th>
                      <th className="text-right">Weight</th>
                      <th className="text-left">Source / Supplier</th>
                      <th className="text-left">Grade / Spec</th>
                      <th className="text-left">Function</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recipe?.ingredients || []).map((ing, i) => (
                      <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                        <td className="py-1 pr-1"><input className="tp-input w-full" value={ing.name || ""} onChange={(e) => updateIngredient(i, "name", e.target.value)} placeholder="Name" /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-20 text-right" type="number" value={ing.percentage ?? ""} onChange={(e) => updateIngredient(i, "percentage", num(e.target.value))} /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-20 text-right" type="number" value={ing.weight ?? ""} onChange={(e) => updateIngredient(i, "weight", num(e.target.value))} /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-full" value={ing.source || ""} onChange={(e) => updateIngredient(i, "source", e.target.value)} /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-full" value={ing.grade || ""} onChange={(e) => updateIngredient(i, "grade", e.target.value)} /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-full" value={ing.function || ""} onChange={(e) => updateIngredient(i, "function", e.target.value)} /></td>
                        <td className="py-1"><button className="tp-btn" onClick={() => removeIngredient(i)} title="Remove"><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="9 · Processing steps (client-supplied)">
              <div className="col-span-2 grid grid-cols-1 gap-2">
                {(data.client_process_steps || []).map((s, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-1 text-xs text-[hsl(var(--tp-text-dim))]">Step {s.step}</span>
                    <input className="tp-input col-span-11" value={s.text || ""} onChange={(e) => {
                      const steps = [...(data.client_process_steps || [])];
                      steps[i] = { ...steps[i], text: e.target.value };
                      setData((p) => ({ ...p, client_process_steps: steps }));
                    }} />
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <TextField label="Bake temperature" v={(data as any).bake?.temperature} onChange={(v) => update(["bake", "temperature"], v)} />
                  <TextField label="Bake time (min)" v={(data as any).bake?.time_minutes} onChange={(v) => update(["bake", "time_minutes"], v)} />
                </div>
              </div>
            </Section>

            <Section
              title="10 · Document history"
              action={<button onClick={addHistory} className="tp-btn text-[11px]"><Plus className="w-3 h-3" /> Add row</button>}
            >
              <div className="col-span-2 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
                    <tr><th className="text-left py-1">Version</th><th className="text-left">Date</th><th className="text-left">Changes</th><th className="text-left">Approved by</th></tr>
                  </thead>
                  <tbody>
                    {(data.document_history || []).map((h, i) => (
                      <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                        <td className="py-1 pr-1"><input className="tp-input w-20" value={h.version || ""} onChange={(e) => updateHistory(i, "version", e.target.value)} /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-28" value={h.date || ""} onChange={(e) => updateHistory(i, "date", e.target.value)} /></td>
                        <td className="py-1 pr-1"><input className="tp-input w-full" value={h.changes || ""} onChange={(e) => updateHistory(i, "changes", e.target.value)} /></td>
                        <td className="py-1"><input className="tp-input w-full" value={h.approved_by || ""} onChange={(e) => updateHistory(i, "approved_by", e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <p className="text-[10px] text-[hsl(var(--tp-text-dim))] pt-2">
              Proprietary processing specs (mix speeds, kettle times, etc.) live in the internal Batch Sheet and are never exposed here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="tp-surface p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-display text-sm text-[hsl(var(--tp-text))]">{title}</h3>
      {action}
    </div>
    <div className="grid grid-cols-2 gap-3">{children}</div>
  </section>
);

const TextField = ({
  label, v, onChange, type = "text",
}: { label: string; v: any; onChange: (v: any) => void; type?: string }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">{label}</span>
    <input className="tp-input w-full" type={type} value={v ?? ""} onChange={(e) => onChange(e.target.value)} />
  </label>
);

const TextAreaField = ({
  label, v, onChange, className = "",
}: { label: string; v: any; onChange: (v: any) => void; className?: string }) => (
  <label className={`block ${className}`}>
    <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">{label}</span>
    <textarea className="tp-input w-full min-h-[60px]" value={v ?? ""} onChange={(e) => onChange(e.target.value)} />
  </label>
);

const num = (s: any): number | null => {
  if (s === "" || s === null || s === undefined) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
