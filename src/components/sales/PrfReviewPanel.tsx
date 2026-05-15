import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X } from "lucide-react";

interface Props {
  prfId: string | null;
  onClose: () => void;
}

export const PrfReviewPanel = ({ prfId, onClose }: Props) => {
  const [prf, setPrf] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!prfId) { setPrf(null); return; }
    setLoading(true);
    (async () => {
      const { data } = await supabase.from("prf_submissions").select("*").eq("id", prfId).maybeSingle();
      setPrf(data);
      // mark as 'reviewing' if currently 'new'
      if (data && data.status === "new") {
        await supabase.from("prf_submissions").update({ status: "reviewing" }).eq("id", prfId);
      }
      setLoading(false);
    })();
  }, [prfId]);

  if (!prfId) return null;

  const downloadJson = () => {
    if (!prf) return;
    const blob = new Blob([JSON.stringify(prf, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prf-${prf.company_name || prf.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Field = ({ label, value }: { label: string; value: any }) => {
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
    const display = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value);
    return (
      <div className="grid grid-cols-3 gap-3 py-2 border-b border-[hsl(var(--tp-hairline))]">
        <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">{label}</p>
        <p className="col-span-2 text-sm text-[hsl(var(--tp-text))] break-words">{display}</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 team-portal" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full max-w-[680px] tp-surface border-l border-[hsl(var(--tp-hairline))] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--tp-hairline))] bg-[hsl(var(--tp-surface))]/95 backdrop-blur">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))]">PRF Review</p>
            <h2 className="font-display text-lg text-[hsl(var(--tp-text))]">
              {prf?.company_name || prf?.product_name || "Loading…"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={downloadJson} className="tp-btn">Download</button>
            <button onClick={onClose} className="tp-btn" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="p-6 space-y-1">
          {loading && <p className="text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>}
          {prf && (
            <>
              <Field label="Company" value={prf.company_name} />
              <Field label="Stage" value={prf.company_stage} />
              <Field label="Founder" value={prf.founder_name} />
              <Field label="Email" value={prf.email} />
              <Field label="Phone" value={prf.phone} />
              <Field label="Product" value={prf.product_name} />
              <Field label="Project type" value={prf.project_type} />
              <Field label="Approach" value={prf.development_approach} />
              <Field label="Finished form" value={prf.finished_form} />
              <Field label="Flavor type" value={prf.flavor_type} />
              <Field label="Application" value={prf.intended_application} />
              <Field label="Requirements" value={prf.additional_requirements} />
              <Field label="Packaging readiness" value={prf.packaging_readiness} />
              <Field label="Primary packaging" value={prf.primary_packaging_vessel} />
              <Field label="Weight per unit" value={prf.weight_per_unit && `${prf.weight_per_unit} ${prf.weight_per_unit_unit || ""}`} />
              <Field label="Units per pack" value={prf.units_per_primary_pack} />
              <Field label="Secondary packaging" value={prf.secondary_packaging} />
              <Field label="Artwork" value={prf.artwork_readiness} />
              <Field label="Label responsibility" value={prf.label_responsibility} />
              <Field label="Pallets required" value={prf.pallets_required} />
              <Field label="Target date" value={prf.target_date} />
              <Field label="Price target / unit" value={prf.price_target_per_unit} />
              <Field label="Annual volume" value={prf.annual_volume} />
              <Field label="Order quantity" value={prf.order_quantity} />
              <Field label="Order frequency" value={prf.order_frequency} />
              <Field label="Warehousing" value={prf.warehousing_needs} />
              <Field label="Notes" value={prf.additional_project_info} />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
