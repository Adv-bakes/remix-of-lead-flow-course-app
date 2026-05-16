import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TeamPage } from "@/components/team/TeamPage";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, Download, Save, CheckCircle2 } from "lucide-react";

interface Ingredient {
  name?: string | null;
  percentage?: number | null;
  weight_g?: number | null;
  weight?: number | null;
  case_weight?: number | string | null;
  case_weight_uom?: string | null;
  vendor_1?: string | null;
  vendor_2?: string | null;
  vendor_3?: string | null;
  vendor_notes?: string | null;
  vendor_source?: string | null;
}

const BatchSheetEditor = () => {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<any>(null);
  const [ings, setIngs] = useState<Ingredient[]>([]);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("batch_sheets").select("*").eq("id", id).single();
    if (error) { toast.error(error.message); return; }
    setSheet(data);
    setIngs(data.data_json?.recipe?.ingredients || []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateIng = (idx: number, patch: Partial<Ingredient>) => {
    setIngs((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch, vendor_source: "staff" } : r));
    setDirty(true);
  };

  const save = async () => {
    if (!sheet) return;
    setSaving(true);
    const dataJson = { ...sheet.data_json, recipe: { ...sheet.data_json?.recipe, ingredients: ings } };
    const { error } = await (supabase as any)
      .from("batch_sheets")
      .update({ data_json: dataJson, updated_at: new Date().toISOString() })
      .eq("id", sheet.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setDirty(false);
    setSheet({ ...sheet, data_json: dataJson });
  };

  const setStatus = async (status: string) => {
    const { error } = await (supabase as any)
      .from("batch_sheets").update({ status, updated_at: new Date().toISOString() }).eq("id", sheet.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`Status: ${status}`);
    setSheet({ ...sheet, status });
  };

  const exportXlsx = async () => {
    if (dirty) { toast.info("Saving first…"); await save(); }
    setExporting(true);
    const { data, error } = await (supabase as any).functions.invoke("export-batch-sheet-xlsx", {
      body: { batch_sheet_id: sheet.id },
    });
    setExporting(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    if (data?.signed_url) window.open(data.signed_url, "_blank");
    toast.success("Excel exported");
  };

  if (!sheet) return <TeamPage title="Batch sheet">Loading…</TeamPage>;
  const d = sheet.data_json || {};
  const header = d.header || {};
  const product = d.product || {};
  const process = d.process || {};
  const pkg = d.packaging || {};

  return (
    <TeamPage
      eyebrow={`Batch sheet · v${sheet.version}`}
      title={header.product_name || "Batch sheet"}
      description={header.company_name || ""}
      actions={
        <>
          <Link to="/team/operations/batch-sheets" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> All sheets
          </Link>
          <Button size="sm" variant="outline" onClick={save} disabled={saving || !dirty}>
            <Save className="w-4 h-4 mr-1" />{saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="outline" onClick={exportXlsx} disabled={exporting}>
            <Download className="w-4 h-4 mr-1" />{exporting ? "Exporting…" : "Excel"}
          </Button>
          {sheet.status !== "approved" && (
            <Button size="sm" onClick={() => setStatus("approved")}>
              <CheckCircle2 className="w-4 h-4 mr-1" />Approve
            </Button>
          )}
        </>
      }
    >
      {/* Summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Method" value={process.method || "—"} />
        <SummaryCard label="Total batch" value={`${d.recipe?.total_batch_weight ?? "—"} ${d.recipe?.weight_unit ?? ""}`.trim()} />
        <SummaryCard label="Unit weight (raw)" value={`${product.target_unit_weight_raw ?? "—"} ${product.weight_unit ?? ""}`.trim()} />
        <SummaryCard label="Status" value={sheet.status} />
      </section>

      {(d.recipe?.warnings?.length || 0) > 0 && (
        <div className="mb-4 border border-amber-500/40 bg-amber-500/10 rounded-md p-3 text-sm">
          <p className="font-medium mb-1">Recipe warnings</p>
          <ul className="list-disc ml-5 space-y-0.5">
            {d.recipe.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* Recipe grid */}
      <section className="border border-border rounded-lg overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left w-10">#</th>
              <th className="px-2 py-2 text-left min-w-[200px]">Ingredient</th>
              <th className="px-2 py-2 text-right w-20">%</th>
              <th className="px-2 py-2 text-right w-24">Weight (g)</th>
              <th className="px-2 py-2 text-left w-28">Case Wt</th>
              <th className="px-2 py-2 text-left w-16">UoM</th>
              <th className="px-2 py-2 text-left min-w-[160px]">Vendor 1</th>
              <th className="px-2 py-2 text-left min-w-[160px]">Vendor 2</th>
              <th className="px-2 py-2 text-left min-w-[160px]">Vendor 3</th>
              <th className="px-2 py-2 text-left min-w-[160px]">Notes</th>
            </tr>
          </thead>
          <tbody>
            {ings.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-1 font-medium">{r.name}</td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{r.percentage ?? ""}</td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{r.weight_g ?? r.weight ?? ""}</td>
                <td className="px-2 py-1">
                  <input className="w-full bg-transparent border border-border rounded px-2 py-1 text-sm"
                    value={r.case_weight ?? ""} onChange={(e) => updateIng(i, { case_weight: e.target.value })} />
                </td>
                <td className="px-2 py-1">
                  <input className="w-full bg-transparent border border-border rounded px-2 py-1 text-sm"
                    value={r.case_weight_uom ?? ""} onChange={(e) => updateIng(i, { case_weight_uom: e.target.value })} />
                </td>
                {[1, 2, 3].map((n) => {
                  const key = `vendor_${n}` as keyof Ingredient;
                  return (
                    <td key={n} className="px-2 py-1">
                      <div className="relative">
                        <input className="w-full bg-transparent border border-border rounded px-2 py-1 text-sm"
                          value={(r[key] as string) ?? ""}
                          onChange={(e) => updateIng(i, { [key]: e.target.value } as any)} />
                        {n === 1 && r.vendor_source === "prior_sheet" && (
                          <span className="absolute -top-2 right-1 text-[9px] bg-blue-500/15 text-blue-700 border border-blue-500/30 rounded px-1">prior</span>
                        )}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 py-1">
                  <input className="w-full bg-transparent border border-border rounded px-2 py-1 text-sm"
                    value={r.vendor_notes ?? ""} onChange={(e) => updateIng(i, { vendor_notes: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Process & Packaging (read-only) */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="border border-border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Process (proprietary)</h3>
          <p className="text-xs text-muted-foreground mb-3">Client-submitted steps. Staff edits are stored separately in <code>processes</code>.</p>
          <ol className="text-sm space-y-1 list-decimal ml-5">
            {(process.pre_bake?.steps || []).map((s: any, i: number) => (
              <li key={i}>{s.action || "(step)"} {s.mix_time_min ? `· ${s.mix_time_min}min` : ""} {s.mix_speed ? `· ${s.mix_speed}` : ""}</li>
            ))}
          </ol>
          {!process.is_no_bake && process.bake && (
            <p className="text-sm mt-3">Bake: {process.bake.temperature || "—"}{process.bake.temp_unit || ""} for {process.bake.time_minutes || "—"} min</p>
          )}
        </div>
        <div className="border border-border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Packaging</h3>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between"><dt className="text-muted-foreground">Primary</dt><dd>{pkg.primary?.vessel || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Units / pack</dt><dd>{pkg.primary?.units_per_pack ?? "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Net wt / pack</dt><dd>{pkg.primary?.net_weight_per_pack ?? "—"} {pkg.primary?.weight_unit ?? ""}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Secondary</dt><dd>{pkg.secondary?.type || "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Units / case</dt><dd>{pkg.secondary?.units_per_case ?? "—"}</dd></div>
          </dl>
        </div>
      </section>

      {(d.services_to_offer?.length || 0) > 0 && (
        <section className="mt-6 border border-border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Services to offer</h3>
          <ul className="list-disc ml-5 text-sm space-y-1">
            {d.services_to_offer.map((s: string, i: number) => <li key={i}>{s}</li>)}
          </ul>
        </section>
      )}
    </TeamPage>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <div className="border border-border rounded-lg p-3">
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-sm font-medium mt-1">{value}</p>
  </div>
);

export default BatchSheetEditor;
