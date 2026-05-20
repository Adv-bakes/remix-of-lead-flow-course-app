import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TeamPage } from "@/components/team/TeamPage";
import { PssPreviewDrawer } from "@/components/sales/PssPreviewDrawer";
import { toast } from "sonner";
import { ArrowLeft, Download, Save, CheckCircle2, History, RefreshCw, Plus, Trash2, FileText, GripVertical, Lock } from "lucide-react";

// Recompute Formula % from grams. Used both inside the editor closure and on load.
const _recomputePercents = <T extends { weight_g?: number | null; weight?: number | null; percentage?: number | null }>(rows: T[]): T[] => {
  const sum = rows.reduce((s, r) => s + (Number(r.weight_g ?? r.weight) || 0), 0);
  if (!sum) return rows;
  return rows.map((r) => {
    const g = Number(r.weight_g ?? r.weight) || 0;
    return { ...r, percentage: Math.round((g / sum) * 10000) / 100 };
  });
};

interface Ingredient {
  name?: string | null;
  percentage?: number | null;
  weight_g?: number | null;
  weight?: number | null;
  weight_unit?: string | null;
  vendor_1?: string | null;
  vendor_2?: string | null;
  vendor_3?: string | null;
  vendor_notes?: string | null;
  vendor_source?: string | null;
  preblend?: string | null;
}

interface MixStep {
  step: number;
  station?: string;
  action?: string;
  ingredients_to_kettle?: string;
  min_to_melt?: string;
  ingredients_to_mixer?: string;
  total_mix_min?: string;
  speed?: string;   // Low / Med / High
  temp?: string;
  notes?: string;
}

const STATIONS = ["Prep", "Kettle", "Mixer", "Sheeter", "Depositor", "Oven", "Cool", "Pack", "Other"];
const VESSEL_TYPES = ["Bag", "Pouch", "Tray", "Clamshell", "Film / Flow-wrap", "Jar", "Bottle", "Box", "Other"];
const SECONDARY_TYPES = ["Retail box", "Retail display", "Caddy", "Shrink bundle", "None", "Other"];
const SHIPPER_TYPES = ["Corrugated RSC", "Telescoping", "Tray pack", "Other"];

const BatchSheetEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<any>(null);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [methodText, setMethodText] = useState<string>("");
  const [mixSteps, setMixSteps] = useState<MixStep[]>([]);
  const [bakeTemp, setBakeTemp] = useState<string>("");
  const [bakeMin, setBakeMin] = useState<string>("");
  const [bakeInternal, setBakeInternal] = useState<string>("");
  const [bakeInternalUnit, setBakeInternalUnit] = useState<string>("°F");
  const [editablePkg, setEditablePkg] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pssOpen, setPssOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("batch_sheets").select("*").eq("id", id).single();
    if (error) { toast.error(error.message); return; }
    setSheet(data);
    const d = data.data_json || {};
    setIngs(_recomputePercents(d.recipe?.ingredients || []));
    setMethodText(d.process?.method_text || d.process?.method || "");
    const specs: MixStep[] = d.process?.specifications && d.process.specifications.length
      ? d.process.specifications.map((s: any, i: number) => ({ step: i + 1, ...s }))
      : (d.process?.pre_bake?.steps || []).map((s: any, i: number) => ({
          step: i + 1,
          station: s.station || "",
          action: s.action || "",
          total_mix_min: s.mix_time_min != null ? String(s.mix_time_min) : "",
          speed: s.mix_speed || "",
          temp: s.temperature != null ? String(s.temperature) : "",
          notes: s.notes || "",
        }));
    setMixSteps(specs.length ? specs : [{ step: 1 }]);
    setBakeTemp(d.process?.bake?.temperature != null ? String(d.process.bake.temperature) : "");
    setBakeMin(d.process?.bake?.time_minutes != null ? String(d.process.bake.time_minutes) : "");
    setBakeInternal(d.process?.bake?.internal_temp_target != null ? String(d.process.bake.internal_temp_target) : "");
    setBakeInternalUnit(d.process?.bake?.internal_temp_unit || "°F");
    // Strip the product-name-as-vessel bug
    const productName = (d.header?.product_name || "").toString().trim().toLowerCase();
    const rawVessel = (d.packaging?.primary?.vessel || "").toString().trim();
    const cleanedVessel = productName && rawVessel.toLowerCase() === productName ? "" : rawVessel;
    setEditablePkg({
      primary: { ...(d.packaging?.primary || {}), vessel: cleanedVessel },
      secondary: { ...(d.packaging?.secondary || {}) },
      shipper: { ...(d.packaging?.shipper || {}) },
      palletizing: { ...(d.packaging?.palletizing || {}) },
    });
    setDirty(false);
    if (data.pss_document_id) {
      const { data: versions } = await (supabase as any)
        .from("batch_sheets")
        .select("id, version, updated_at, source_change, last_edited_by, superseded_at, status")
        .eq("pss_document_id", data.pss_document_id)
        .order("version", { ascending: false });
      setHistory(versions || []);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const isSuperseded = !!sheet?.superseded_at;

  // ---- Ingredient editing with auto-% recompute ----
  const recomputePercents = (rows: Ingredient[]): Ingredient[] => {
    const sum = rows.reduce((s, r) => s + (Number(r.weight_g ?? r.weight) || 0), 0);
    if (!sum) return rows;
    return rows.map((r) => {
      const g = Number(r.weight_g ?? r.weight) || 0;
      return { ...r, percentage: Math.round((g / sum) * 10000) / 100 };
    });
  };

  const updateIng = (idx: number, patch: Partial<Ingredient>) => {
    if (isSuperseded) return;
    setIngs((prev) => {
      let next = prev.map((r, i) => i === idx ? { ...r, ...patch, vendor_source: "staff" } : r);
      if ("weight_g" in patch || "weight" in patch) {
        next = recomputePercents(next);
      }
      return next;
    });
    setDirty(true);
  };
  const addIng = () => {
    if (isSuperseded) return;
    setIngs((prev) => [...prev, { name: "", weight_g: null, percentage: null }]);
    setDirty(true);
  };
  const removeIng = (idx: number) => {
    if (isSuperseded) return;
    setIngs((prev) => recomputePercents(prev.filter((_, i) => i !== idx)));
    setDirty(true);
  };

  const totalPct = useMemo(() => ings.reduce((s, r) => s + (Number(r.percentage) || 0), 0), [ings]);
  const totalGrams = useMemo(() => ings.reduce((s, r) => s + (Number(r.weight_g ?? r.weight) || 0), 0), [ings]);
  const pctDrift = Math.abs(totalPct - 100) > 0.5 && totalPct > 0;

  // ---- Mix steps ----
  const updateMix = (idx: number, patch: Partial<MixStep>) => {
    if (isSuperseded) return;
    setMixSteps((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
    setDirty(true);
  };
  const addMix = () => { setMixSteps((p) => [...p, { step: p.length + 1 }]); setDirty(true); };
  const removeMix = (idx: number) => {
    setMixSteps((p) => p.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step: i + 1 })));
    setDirty(true);
  };

  const save = async () => {
    if (!sheet || isSuperseded) return;
    setSaving(true);
    const pre_bake_steps = mixSteps.map((s) => ({
      step_number: s.step,
      station: s.station || "",
      action: s.action || "",
      mix_time_min: s.total_mix_min ? Number(s.total_mix_min) : null,
      mix_speed: s.speed || "",
      temperature: s.temp ? Number(s.temp) : null,
      notes: s.notes || "",
      ingredients_added: [],
    }));
    const existingProcess = sheet.data_json?.process || {};
    const newProcess = {
      ...existingProcess,
      method_text: existingProcess.method_text || methodText || "",
      method: existingProcess.method || methodText || "",
      specifications: mixSteps,
      seeded_from_pss_at: existingProcess.seeded_from_pss_at || new Date().toISOString(),
      team_edited_at: new Date().toISOString(),
      pre_bake: { ...(existingProcess.pre_bake || {}), steps: pre_bake_steps },
      bake: {
        ...(existingProcess.bake || {}),
        temperature: bakeTemp ? Number(bakeTemp) : null,
        time_minutes: bakeMin ? Number(bakeMin) : null,
        internal_temp_target: bakeInternal ? Number(bakeInternal) : null,
        internal_temp_unit: bakeInternalUnit || null,
      },
    };
    // Compute units/secondary and units/case from the multipliers so the
    // operator never has to type a number that's just A × B.
    const upPrimary = Number(editablePkg.primary?.units_per_pack) || 0;
    const primPerSec = Number(editablePkg.secondary?.primaries_per_secondary) || 0;
    const computedUnitsPerSecondary = upPrimary && primPerSec
      ? upPrimary * primPerSec
      : (editablePkg.secondary?.units_per_secondary ?? null);
    const secPerCase = Number(editablePkg.shipper?.secondaries_per_case) || 0;
    const computedUnitsPerCase = computedUnitsPerSecondary && secPerCase
      ? Number(computedUnitsPerSecondary) * secPerCase
      : (editablePkg.shipper?.units_per_case ?? null);
    const persistedPkg = {
      ...editablePkg,
      secondary: {
        ...editablePkg.secondary,
        units_per_secondary: computedUnitsPerSecondary,
        units_per_case: computedUnitsPerSecondary, // legacy mirror
      },
      shipper: { ...editablePkg.shipper, units_per_case: computedUnitsPerCase },
    };
    const dataJson = {
      ...sheet.data_json,
      recipe: { ...sheet.data_json?.recipe, ingredients: ings },
      process: newProcess,
      packaging: persistedPkg,
    };
    const { data, error } = await (supabase as any).functions.invoke("revise-batch-sheet", {
      body: { batch_sheet_id: sheet.id, data_json: dataJson, source_change: "staff_edit" },
    });
    setSaving(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success(`Saved as v${data.batch_sheet.version}`);
    setDirty(false);
    navigate(`/team/operations/batch-sheets/${data.batch_sheet.id}`);
  };

  const regenerateFromPss = async () => {
    if (!sheet?.pss_document_id) return;
    if (!confirm("Re-extract from the PSS and create a new version? Staff-entered vendors will carry over.")) return;
    setRegenerating(true);
    const { data, error } = await (supabase as any).functions.invoke("generate-batch-sheet-from-pss", {
      body: { pss_document_id: sheet.pss_document_id },
    });
    setRegenerating(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success(`Regenerated as v${data.batch_sheet.version}`);
    navigate(`/team/operations/batch-sheets/${data.batch_sheet.id}`);
  };

  const setStatus = async (status: string) => {
    const { error } = await (supabase as any)
      .from("batch_sheets").update({ status, updated_at: new Date().toISOString() }).eq("id", sheet.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status: ${status}`);
    setSheet({ ...sheet, status });
  };

  const exportXlsx = async () => {
    if (dirty) { toast.info("Saving first…"); await save(); return; }
    setExporting(true);
    const { data, error } = await (supabase as any).functions.invoke("export-batch-sheet-xlsx", {
      body: { batch_sheet_id: sheet.id },
    });
    setExporting(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    if (data?.signed_url) window.open(data.signed_url, "_blank");
    toast.success("Excel exported");
  };

  const syncWithPss = async () => {
    if (!sheet) return;
    setSyncing(true);
    const { data, error } = await (supabase as any).functions.invoke("reconcile-pss-batch", {
      body: { batch_sheet_id: sheet.id },
    });
    setSyncing(false);
    if (error || data?.error) { toast.error(error?.message || data?.error || "Sync failed"); return; }
    const f = data?.filled || {};
    const total = (f.pss_filled_count || 0) + (f.batch_filled_count || 0);
    if (total > 0) {
      toast.success(`Synced: ${f.batch_filled_count || 0} batch field(s), ${f.pss_filled_count || 0} PSS field(s).`);
      await load();
    } else {
      toast.info("Nothing to sync — both sides already aligned.");
    }
  };

  if (!sheet) return <TeamPage title="Batch sheet">Loading…</TeamPage>;
  const d = sheet.data_json || {};
  const header = d.header || {};
  const product = d.product || {};

  return (
    <TeamPage
      eyebrow={`Batch sheet · v${sheet.version}${isSuperseded ? " (superseded)" : ""}`}
      title={header.product_name || "Batch sheet"}
      description={`${header.company_name || ""}${header.company_name ? " · " : ""}Last changed ${new Date(sheet.updated_at).toLocaleString()}${sheet.source_change ? ` · ${sheet.source_change.replace(/_/g, " ")}` : ""}`}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link to="/team/operations/batch-sheets" className="tp-btn">
            <ArrowLeft className="w-3.5 h-3.5" /> All sheets
          </Link>
          {sheet.pss_document_id && (
            <button className="tp-btn" onClick={() => setPssOpen(true)} title="Open the source PSS in a side drawer">
              <FileText className="w-3.5 h-3.5" /> View PSS
            </button>
          )}
          <button className="tp-btn" onClick={() => setShowHistory((v) => !v)}>
            <History className="w-3.5 h-3.5" /> History ({history.length})
          </button>
          {sheet.pss_document_id && !isSuperseded && (
            <button className="tp-btn" onClick={regenerateFromPss} disabled={regenerating}>
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Regenerating…" : "Regenerate from PSS"}
            </button>
          )}
          {sheet.pss_document_id && !isSuperseded && (
            <button className="tp-btn" onClick={syncWithPss} disabled={syncing}>
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync with PSS"}
            </button>
          )}
          <button className="tp-btn" onClick={save} disabled={saving || !dirty || isSuperseded}>
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save as new version"}
          </button>
          <button className="tp-btn" onClick={exportXlsx} disabled={exporting}>
            <Download className="w-3.5 h-3.5" /> {exporting ? "Exporting…" : "Excel"}
          </button>
          {sheet.status !== "approved" && !isSuperseded && (
            <button className="tp-btn tp-btn-primary" onClick={() => setStatus("approved")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          )}
        </div>
      }
    >
      {isSuperseded && (
        <div className="mb-4 border border-amber-500/40 bg-amber-500/10 rounded-md p-3 text-sm">
          This is an older version (read-only). A newer version (v{sheet.superseded_by_version}) exists.
        </div>
      )}

      {showHistory && (
        <section className="mb-6 border border-[hsl(var(--tp-hairline))] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--tp-surface-2))] text-xs uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
              <tr>
                <th className="px-3 py-2 text-left">Version</th>
                <th className="px-3 py-2 text-left">Changed</th>
                <th className="px-3 py-2 text-left">Reason</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className={`border-t border-[hsl(var(--tp-hairline))] ${h.id === sheet.id ? "bg-[hsl(var(--tp-gold)/0.06)]" : ""}`}>
                  <td className="px-3 py-2 font-medium">v{h.version}{!h.superseded_at && " (active)"}</td>
                  <td className="px-3 py-2 text-[hsl(var(--tp-text-dim))]">{new Date(h.updated_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-[hsl(var(--tp-text-dim))]">{(h.source_change || "—").replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-[hsl(var(--tp-text-dim))]">{h.status}</td>
                  <td className="px-3 py-2 text-right">
                    {h.id !== sheet.id && (
                      <Link to={`/team/operations/batch-sheets/${h.id}`} className="text-xs text-[hsl(var(--tp-gold-soft))] hover:underline">Open</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Summary — no meaningless "Total batch weight" */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Unit weight (raw)" value={`${product.target_unit_weight_raw ?? "—"} ${product.weight_unit ?? ""}`.trim()} />
        <SummaryCard label="Formula totals" value={`${totalPct.toFixed(2)}%`} warn={pctDrift} />
        <SummaryCard label="Status" value={sheet.status} />
      </section>

      {pctDrift && (
        <div className="mb-4 border border-amber-500/40 bg-amber-500/10 rounded-md p-3 text-sm">
          Formula percentages sum to <strong>{totalPct.toFixed(2)}%</strong>. They should equal 100%. Adjust ingredient weights or percentages.
        </div>
      )}

      {(d.recipe?.warnings?.length || 0) > 0 && (
        <div className="mb-4 border border-amber-500/40 bg-amber-500/10 rounded-md p-3 text-sm">
          <p className="font-medium mb-1">Recipe warnings</p>
          <ul className="list-disc ml-5 space-y-0.5">
            {d.recipe.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Recipe — per-unit formula calculator */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">Formula (per unit)</h3>
          <button className="tp-btn" onClick={addIng} disabled={isSuperseded}><Plus className="w-3.5 h-3.5" /> Add ingredient</button>
        </div>
        <div className="border border-[hsl(var(--tp-hairline))] rounded-lg overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 960 }}>
            <thead className="bg-[hsl(var(--tp-surface-2))] text-xs uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left min-w-[220px]">Ingredient</th>
                <th className="px-2 py-2 text-right min-w-[110px]">% Formula</th>
                <th className="px-2 py-2 text-right min-w-[130px]">Grams / unit</th>
                <th className="px-2 py-2 text-left min-w-[110px]">Preblend</th>
                <th className="px-2 py-2 text-left min-w-[180px]">Vendor</th>
                <th className="px-2 py-2 text-left min-w-[180px]">Notes</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {ings.map((r, i) => {
                const hasAlt = !!(r.vendor_2 || r.vendor_3);
                return (
                  <tr key={i} className="border-t border-[hsl(var(--tp-hairline))] align-top">
                    <td className="px-2 py-2 text-[hsl(var(--tp-text-dim))]">{i + 1}</td>
                    <td className="px-2 py-1">
                      <input className="tp-input w-full" value={r.name ?? ""} onChange={(e) => updateIng(i, { name: e.target.value })} placeholder="Ingredient name" />
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-end gap-1">
                        <input className="tp-input w-full text-right tabular-nums" type="number" step="0.01"
                          value={r.percentage ?? ""} onChange={(e) => updateIng(i, { percentage: e.target.value === "" ? null : Number(e.target.value) })} />
                        <span className="text-[hsl(var(--tp-text-dim))] text-xs">%</span>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex items-center justify-end gap-1">
                        <input className="tp-input w-full text-right tabular-nums" type="number" step="0.01"
                          value={r.weight_g ?? r.weight ?? ""} onChange={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            updateIng(i, { weight_g: v, weight: v });
                          }} />
                        <span className="text-[hsl(var(--tp-text-dim))] text-xs">g</span>
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <input className="tp-input w-full" value={r.preblend ?? ""} onChange={(e) => updateIng(i, { preblend: e.target.value })} placeholder="—" />
                    </td>
                    <td className="px-2 py-1">
                      <input className="tp-input w-full" value={r.vendor_1 ?? ""} placeholder="Primary vendor" onChange={(e) => updateIng(i, { vendor_1: e.target.value })} />
                      {hasAlt ? (
                        <div className="mt-1 space-y-1">
                          <input className="tp-input w-full" value={r.vendor_2 ?? ""} placeholder="Alt vendor 2" onChange={(e) => updateIng(i, { vendor_2: e.target.value })} />
                          <input className="tp-input w-full" value={r.vendor_3 ?? ""} placeholder="Alt vendor 3" onChange={(e) => updateIng(i, { vendor_3: e.target.value })} />
                        </div>
                      ) : (
                        <button type="button" className="text-[11px] text-[hsl(var(--tp-gold-soft))] hover:underline mt-1"
                          onClick={() => updateIng(i, { vendor_2: " " })}>+ alt vendor</button>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      <input className="tp-input w-full" value={r.vendor_notes ?? ""} onChange={(e) => updateIng(i, { vendor_notes: e.target.value })} />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        className="inline-flex items-center justify-center w-8 h-8 rounded border border-red-500/40 text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                        onClick={() => removeIng(i)}
                        disabled={isSuperseded}
                        title="Remove ingredient"
                        aria-label="Remove ingredient"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-[hsl(var(--tp-hairline-strong))] bg-[hsl(var(--tp-surface-2))] font-medium">
                <td colSpan={2} className="px-2 py-2 text-right text-[hsl(var(--tp-text-dim))]">Totals</td>
                <td className={`px-2 py-2 text-right tabular-nums ${pctDrift ? "text-amber-500" : "text-[hsl(var(--tp-text))]"}`}>{totalPct.toFixed(2)}%</td>
                <td className="px-2 py-2 text-right tabular-nums text-[hsl(var(--tp-text))]">{totalGrams.toFixed(2)} g</td>
                <td colSpan={4}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[hsl(var(--tp-text-dim))] mt-2">
          Percentages auto-recompute from grams when you edit a weight. Order-quantity scaling happens on the production batch screen — not here.
        </p>
      </section>

      {/* Processing Specifications — step list only, mirrors PSS Section 9 */}
      <section className="mb-8 border border-[hsl(var(--tp-hairline))] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Processing specifications (proprietary)</h3>
          <button className="tp-btn" onClick={addMix} disabled={isSuperseded}><Plus className="w-3.5 h-3.5" /> Add step</button>
        </div>
        <div className="border border-[hsl(var(--tp-hairline))] rounded-lg overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: 820 }}>
            <thead className="bg-[hsl(var(--tp-surface-2))] text-xs uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left min-w-[120px]">Station</th>
                <th className="px-2 py-2 text-left min-w-[260px]">Action / description</th>
                <th className="px-2 py-2 text-left min-w-[90px]">Time (min)</th>
                <th className="px-2 py-2 text-left min-w-[90px]">Temp</th>
                <th className="px-2 py-2 text-left min-w-[200px]">Notes</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {mixSteps.map((s, i) => (
                <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                  <td className="px-2 py-2 text-[hsl(var(--tp-text-dim))]">{s.step}</td>
                  <td className="px-2 py-1">
                    <select className="tp-input w-full" value={s.station ?? ""} onChange={(e) => updateMix(i, { station: e.target.value })}>
                      <option value="">—</option>
                      {STATIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.action ?? ""} onChange={(e) => updateMix(i, { action: e.target.value })} placeholder="Describe the step…" /></td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.total_mix_min ?? ""} onChange={(e) => updateMix(i, { total_mix_min: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.temp ?? ""} onChange={(e) => updateMix(i, { temp: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.notes ?? ""} onChange={(e) => updateMix(i, { notes: e.target.value })} placeholder="Speed, equipment, ingredients added…" /></td>
                  <td className="px-2 py-1"><button className="tp-btn" onClick={() => removeMix(i)} disabled={isSuperseded}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Bake temperature</span>
            <input className="tp-input w-full" value={bakeTemp} onChange={(e) => { setBakeTemp(e.target.value); setDirty(true); }} placeholder="e.g. 350 °F or None" disabled={isSuperseded} />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Bake time (min)</span>
            <input className="tp-input w-full" value={bakeMin} onChange={(e) => { setBakeMin(e.target.value); setDirty(true); }} placeholder="e.g. 12 or None" disabled={isSuperseded} />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Internal temp target</span>
            <input className="tp-input w-full" value={bakeInternal} onChange={(e) => { setBakeInternal(e.target.value); setDirty(true); }} placeholder="e.g. 200 or None" disabled={isSuperseded} />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Internal temp unit</span>
            <select className="tp-input w-full" value={bakeInternalUnit} onChange={(e) => { setBakeInternalUnit(e.target.value); setDirty(true); }} disabled={isSuperseded}>
              <option>°F</option><option>°C</option>
            </select>
          </label>
        </div>
      </section>

      {/* Packaging (editable, 3-tier) */}
      <section className="mb-8 border border-[hsl(var(--tp-hairline))] rounded-lg p-4">
        <h3 className="font-semibold mb-3">Packaging</h3>

        <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold-soft))] mb-2">Primary vessel</p>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <PkgSelect label="Vessel type" v={editablePkg.primary?.vessel_type} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, vessel_type: v } })); setDirty(true); }} options={VESSEL_TYPES} />
          <PkgField label="Vessel size / spec" v={editablePkg.primary?.vessel} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, vessel: v } })); setDirty(true); }} placeholder="e.g. 5×9 pre-made bag" />
          <PkgField label="Units / primary pack" v={editablePkg.primary?.units_per_pack} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, units_per_pack: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
          <PkgField label="Net wt / primary pack" v={editablePkg.primary?.net_weight_per_pack} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, net_weight_per_pack: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
          <PkgField label="Weight unit" v={editablePkg.primary?.weight_unit} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, weight_unit: v } })); setDirty(true); }} />

        </div>

        {(() => {
          const upPrim = Number(editablePkg.primary?.units_per_pack) || 0;
          const primPerSec = Number(editablePkg.secondary?.primaries_per_secondary) || 0;
          const unitsPerSec = upPrim && primPerSec ? upPrim * primPerSec : null;
          const secPerCase = Number(editablePkg.shipper?.secondaries_per_case) || 0;
          const unitsPerCase = unitsPerSec && secPerCase ? unitsPerSec * secPerCase : null;
          return (
            <>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold-soft))] mb-2">Secondary package (retail display / retail box)</p>
              <div className="grid md:grid-cols-2 gap-3 mb-1">
                <PkgSelect label="Type" v={editablePkg.secondary?.type} on={(v) => { setEditablePkg((p: any) => ({ ...p, secondary: { ...p.secondary, type: v } })); setDirty(true); }} options={SECONDARY_TYPES} />
                <PkgField label="Primaries / secondary" v={editablePkg.secondary?.primaries_per_secondary} on={(v) => { setEditablePkg((p: any) => ({ ...p, secondary: { ...p.secondary, primaries_per_secondary: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
              </div>
              <p className="text-[11px] text-[hsl(var(--tp-text-dim))] mb-4">
                Units per secondary = <strong className="text-[hsl(var(--tp-text))]">{unitsPerSec ?? "—"}</strong>
                {upPrim && primPerSec ? ` (${primPerSec} × ${upPrim})` : " (fill primary units & primaries/secondary above)"}
              </p>

              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold-soft))] mb-2">Shipper case (master carton)</p>
              <div className="grid md:grid-cols-2 gap-3 mb-1">
                <PkgSelect label="Case type" v={editablePkg.shipper?.case_type} on={(v) => { setEditablePkg((p: any) => ({ ...p, shipper: { ...p.shipper, case_type: v } })); setDirty(true); }} options={SHIPPER_TYPES} />
                <PkgField label="Secondaries / case" v={editablePkg.shipper?.secondaries_per_case} on={(v) => { setEditablePkg((p: any) => ({ ...p, shipper: { ...p.shipper, secondaries_per_case: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
                <PkgField label="Cases / pallet" v={editablePkg.shipper?.cases_per_pallet ?? editablePkg.palletizing?.cases_per_pallet} on={(v) => { setEditablePkg((p: any) => ({ ...p, shipper: { ...p.shipper, cases_per_pallet: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
              </div>
              <p className="text-[11px] text-[hsl(var(--tp-text-dim))]">
                Units per case = <strong className="text-[hsl(var(--tp-text))]">{unitsPerCase ?? "—"}</strong>
                {unitsPerSec && secPerCase ? ` (${secPerCase} × ${unitsPerSec})` : " (fill the multipliers above)"}
              </p>
            </>
          );
        })()}
      </section>


      {(d.services_to_offer?.length || 0) > 0 && (
        <section className="mt-6 border border-[hsl(var(--tp-hairline))] rounded-lg p-4">
          <h3 className="font-semibold mb-2">Services to offer</h3>
          <ul className="list-disc ml-5 text-sm space-y-1">
            {d.services_to_offer.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}

      <PssPreviewDrawer
        pssDocumentId={pssOpen && sheet?.pss_document_id ? sheet.pss_document_id : null}
        onClose={() => setPssOpen(false)}
        onSaved={() => load()}
      />
    </TeamPage>
  );
};

const SummaryCard = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className={`border rounded-lg p-3 ${warn ? "border-amber-500/40 bg-amber-500/10" : "border-[hsl(var(--tp-hairline))]"}`}>
    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">{label}</p>
    <p className={`text-sm font-medium mt-1 ${warn ? "text-amber-500" : ""}`}>{value}</p>
  </div>
);

const PkgField = ({ label, v, on, type = "text", placeholder }: { label: string; v: any; on: (v: string) => void; type?: string; placeholder?: string }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">{label}</span>
    <input className="tp-input w-full" type={type} value={v ?? ""} placeholder={placeholder} onChange={(e) => on(e.target.value)} />
  </label>
);

const PkgSelect = ({ label, v, on, options }: { label: string; v: any; on: (v: string) => void; options: string[] }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">{label}</span>
    <select className="tp-input w-full" value={v ?? ""} onChange={(e) => on(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </label>
);

export default BatchSheetEditor;
