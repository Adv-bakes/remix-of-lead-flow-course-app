import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TeamPage } from "@/components/team/TeamPage";
import { toast } from "sonner";
import { ArrowLeft, Download, Save, CheckCircle2, History, RefreshCw, Plus, Trash2 } from "lucide-react";

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
  action?: string;
  ingredients_to_kettle?: string;
  min_to_melt?: string;
  ingredients_to_mixer?: string;
  total_mix_min?: string;
  speed?: string;   // Low / Med / High
}

const BatchSheetEditor = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<any>(null);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [methodText, setMethodText] = useState<string>("");
  const [mixSteps, setMixSteps] = useState<MixStep[]>([]);
  const [bakeTemp, setBakeTemp] = useState<string>("");
  const [bakeMin, setBakeMin] = useState<string>("");
  const [editablePkg, setEditablePkg] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("batch_sheets").select("*").eq("id", id).single();
    if (error) { toast.error(error.message); return; }
    setSheet(data);
    const d = data.data_json || {};
    setIngs(d.recipe?.ingredients || []);
    setMethodText(d.process?.method_text || d.process?.method || "");
    const specs: MixStep[] = d.process?.specifications && d.process.specifications.length
      ? d.process.specifications
      : (d.process?.pre_bake?.steps || []).map((s: any, i: number) => ({
          step: i + 1,
          action: s.action || "",
          total_mix_min: s.mix_time_min != null ? String(s.mix_time_min) : "",
          speed: s.mix_speed || "",
        }));
    setMixSteps(specs.length ? specs : [{ step: 1 }]);
    setBakeTemp(d.process?.bake?.temperature != null ? String(d.process.bake.temperature) : "");
    setBakeMin(d.process?.bake?.time_minutes != null ? String(d.process.bake.time_minutes) : "");
    setEditablePkg({
      primary: { ...(d.packaging?.primary || {}) },
      secondary: { ...(d.packaging?.secondary || {}) },
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
    // Mirror structured mix steps into the legacy process.pre_bake.steps path
    // so the existing xlsx exporter and Sourcing Bot continue to work.
    const pre_bake_steps = mixSteps.map((s) => ({
      action: s.action || "",
      mix_time_min: s.total_mix_min ? Number(s.total_mix_min) : null,
      mix_speed: s.speed || "",
      ingredients_added: [],
    }));
    const newProcess = {
      ...(sheet.data_json?.process || {}),
      method_text: methodText,
      method: methodText, // keep legacy key in sync for the Sourcing Bot
      specifications: mixSteps,
      pre_bake: { ...(sheet.data_json?.process?.pre_bake || {}), steps: pre_bake_steps },
      bake: {
        ...(sheet.data_json?.process?.bake || {}),
        temperature: bakeTemp ? Number(bakeTemp) : null,
        time_minutes: bakeMin ? Number(bakeMin) : null,
      },
    };
    const dataJson = {
      ...sheet.data_json,
      recipe: { ...sheet.data_json?.recipe, ingredients: ings },
      process: newProcess,
      packaging: editablePkg,
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
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--tp-surface-2))] text-xs uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left min-w-[200px]">Ingredient</th>
                <th className="px-2 py-2 text-right w-24">% Formula</th>
                <th className="px-2 py-2 text-right w-28">Grams / unit</th>
                <th className="px-2 py-2 text-left w-28">Preblend</th>
                <th className="px-2 py-2 text-left min-w-[140px]">Vendor 1</th>
                <th className="px-2 py-2 text-left min-w-[140px]">Vendor 2</th>
                <th className="px-2 py-2 text-left min-w-[140px]">Vendor 3</th>
                <th className="px-2 py-2 text-left min-w-[160px]">Notes</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {ings.map((r, i) => (
                <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                  <td className="px-2 py-1 text-[hsl(var(--tp-text-dim))]">{i + 1}</td>
                  <td className="px-2 py-1">
                    <input className="tp-input w-full" value={r.name ?? ""} onChange={(e) => updateIng(i, { name: e.target.value })} placeholder="Ingredient name" />
                  </td>
                  <td className="px-2 py-1">
                    <input className="tp-input w-full text-right tabular-nums" type="number" step="0.01"
                      value={r.percentage ?? ""} onChange={(e) => updateIng(i, { percentage: e.target.value === "" ? null : Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <input className="tp-input w-full text-right tabular-nums" type="number" step="0.01"
                      value={r.weight_g ?? r.weight ?? ""} onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        updateIng(i, { weight_g: v, weight: v });
                      }} />
                  </td>
                  <td className="px-2 py-1">
                    <input className="tp-input w-full" value={r.preblend ?? ""} onChange={(e) => updateIng(i, { preblend: e.target.value })} placeholder="—" />
                  </td>
                  {[1, 2, 3].map((n) => {
                    const key = `vendor_${n}` as keyof Ingredient;
                    return (
                      <td key={n} className="px-2 py-1">
                        <input className="tp-input w-full" value={(r[key] as string) ?? ""} onChange={(e) => updateIng(i, { [key]: e.target.value } as any)} />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1">
                    <input className="tp-input w-full" value={r.vendor_notes ?? ""} onChange={(e) => updateIng(i, { vendor_notes: e.target.value })} />
                  </td>
                  <td className="px-2 py-1">
                    <button className="tp-btn" onClick={() => removeIng(i)} disabled={isSuperseded} title="Remove"><Trash2 className="w-3 h-3" /></button>
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[hsl(var(--tp-hairline-strong))] bg-[hsl(var(--tp-surface-2))] font-medium">
                <td colSpan={2} className="px-2 py-2 text-right text-[hsl(var(--tp-text-dim))]">Totals</td>
                <td className={`px-2 py-2 text-right tabular-nums ${pctDrift ? "text-amber-500" : "text-[hsl(var(--tp-text))]"}`}>{totalPct.toFixed(2)}%</td>
                <td colSpan={7}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[hsl(var(--tp-text-dim))] mt-2">
          Percentages auto-recompute from grams when you edit a weight. Order-quantity scaling happens on the production batch screen — not here.
        </p>
      </section>

      {/* Processing Specifications */}
      <section className="mb-8 border border-[hsl(var(--tp-hairline))] rounded-lg p-4">
        <h3 className="font-semibold mb-3">Processing specifications (proprietary)</h3>

        <label className="block mb-4">
          <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Method / procedure (free text — paste here)</span>
          <textarea
            className="tp-input w-full min-h-[120px] font-mono text-xs"
            value={methodText}
            onChange={(e) => { setMethodText(e.target.value); setDirty(true); }}
            placeholder="Paste or describe the full method here…"
            disabled={isSuperseded}
          />
        </label>

        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-[hsl(var(--tp-text-dim))]">Mix-step schedule</p>
          <button className="tp-btn" onClick={addMix} disabled={isSuperseded}><Plus className="w-3.5 h-3.5" /> Add step</button>
        </div>
        <div className="border border-[hsl(var(--tp-hairline))] rounded-lg overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[hsl(var(--tp-surface-2))] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left">Action</th>
                <th className="px-2 py-2 text-left">Ingredients → kettle</th>
                <th className="px-2 py-2 text-left">Min to melt</th>
                <th className="px-2 py-2 text-left">Ingredients → mixer</th>
                <th className="px-2 py-2 text-left">Total mix min</th>
                <th className="px-2 py-2 text-left">Speed</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {mixSteps.map((s, i) => (
                <tr key={i} className="border-t border-[hsl(var(--tp-hairline))]">
                  <td className="px-2 py-1 text-[hsl(var(--tp-text-dim))]">{s.step}</td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.action ?? ""} onChange={(e) => updateMix(i, { action: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.ingredients_to_kettle ?? ""} onChange={(e) => updateMix(i, { ingredients_to_kettle: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className="tp-input w-20" value={s.min_to_melt ?? ""} onChange={(e) => updateMix(i, { min_to_melt: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className="tp-input w-full" value={s.ingredients_to_mixer ?? ""} onChange={(e) => updateMix(i, { ingredients_to_mixer: e.target.value })} /></td>
                  <td className="px-2 py-1"><input className="tp-input w-20" value={s.total_mix_min ?? ""} onChange={(e) => updateMix(i, { total_mix_min: e.target.value })} /></td>
                  <td className="px-2 py-1">
                    <select className="tp-input w-full" value={s.speed ?? ""} onChange={(e) => updateMix(i, { speed: e.target.value })}>
                      <option value="">—</option><option>Low</option><option>Med</option><option>High</option>
                    </select>
                  </td>
                  <td className="px-2 py-1"><button className="tp-btn" onClick={() => removeMix(i)} disabled={isSuperseded}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 max-w-md">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Bake temperature</span>
            <input className="tp-input w-full" value={bakeTemp} onChange={(e) => { setBakeTemp(e.target.value); setDirty(true); }} placeholder="e.g. 350 °F" disabled={isSuperseded} />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Bake time (min)</span>
            <input className="tp-input w-full" value={bakeMin} onChange={(e) => { setBakeMin(e.target.value); setDirty(true); }} placeholder="e.g. 12" disabled={isSuperseded} />
          </label>
        </div>
      </section>

      {/* Packaging (editable) */}
      <section className="mb-8 border border-[hsl(var(--tp-hairline))] rounded-lg p-4">
        <h3 className="font-semibold mb-3">Packaging</h3>
        <div className="grid md:grid-cols-2 gap-3">
          <PkgField label="Primary vessel" v={editablePkg.primary?.vessel} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, vessel: v } })); setDirty(true); }} />
          <PkgField label="Units / primary pack" v={editablePkg.primary?.units_per_pack} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, units_per_pack: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
          <PkgField label="Net wt / pack" v={editablePkg.primary?.net_weight_per_pack} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, net_weight_per_pack: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
          <PkgField label="Weight unit" v={editablePkg.primary?.weight_unit} on={(v) => { setEditablePkg((p: any) => ({ ...p, primary: { ...p.primary, weight_unit: v } })); setDirty(true); }} />
          <PkgField label="Secondary (case/caddy/shipper)" v={editablePkg.secondary?.type} on={(v) => { setEditablePkg((p: any) => ({ ...p, secondary: { ...p.secondary, type: v } })); setDirty(true); }} />
          <PkgField label="Units / case" v={editablePkg.secondary?.units_per_case} on={(v) => { setEditablePkg((p: any) => ({ ...p, secondary: { ...p.secondary, units_per_case: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
          <PkgField label="Cases / pallet" v={editablePkg.palletizing?.cases_per_pallet} on={(v) => { setEditablePkg((p: any) => ({ ...p, palletizing: { ...p.palletizing, cases_per_pallet: v === "" ? null : Number(v) } })); setDirty(true); }} type="number" />
        </div>
      </section>

      {(d.services_to_offer?.length || 0) > 0 && (
        <section className="mt-6 border border-[hsl(var(--tp-hairline))] rounded-lg p-4">
          <h3 className="font-semibold mb-2">Services to offer</h3>
          <ul className="list-disc ml-5 text-sm space-y-1">
            {d.services_to_offer.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}
    </TeamPage>
  );
};

const SummaryCard = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div className={`border rounded-lg p-3 ${warn ? "border-amber-500/40 bg-amber-500/10" : "border-[hsl(var(--tp-hairline))]"}`}>
    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">{label}</p>
    <p className={`text-sm font-medium mt-1 ${warn ? "text-amber-500" : ""}`}>{value}</p>
  </div>
);

const PkgField = ({ label, v, on, type = "text" }: { label: string; v: any; on: (v: string) => void; type?: string }) => (
  <label className="block">
    <span className="block text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">{label}</span>
    <input className="tp-input w-full" type={type} value={v ?? ""} onChange={(e) => on(e.target.value)} />
  </label>
);

export default BatchSheetEditor;
