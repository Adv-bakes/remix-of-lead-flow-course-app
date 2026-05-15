import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage } from "@/components/team/TeamPage";
import { PrfReviewPanel } from "@/components/sales/PrfReviewPanel";
import { RejectEmailDialog } from "@/components/sales/RejectEmailDialog";
import { Eye, Check, X } from "lucide-react";

interface PrfRow {
  id: string;
  product_name: string | null;
  company_name: string | null;
  founder_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

const SalesDocumentsInbox = () => {
  const [rows, setRows] = useState<PrfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PrfRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("prf_submissions")
      .select("id, product_name, company_name, founder_name, email, phone, status, created_at")
      .in("status", ["new", "reviewing"])
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const accept = async (row: PrfRow) => {
    const { error } = await supabase
      .from("prf_submissions")
      .update({ status: "accepted" })
      .eq("id", row.id);
    if (error) return toast.error(error.message);

    if (row.email) {
      await (supabase as any)
        .from("sales_leads")
        .update({ stage: "Send Documents", stage_updated_at: new Date().toISOString() })
        .eq("email", row.email.toLowerCase());
    }
    toast.success("Accepted — moved to Send Documents");
    setRows((r) => r.filter((x) => x.id !== row.id));
  };

  return (
    <TeamPage
      eyebrow="Sales"
      title="Documents Inbox"
      description="Review each PRF, then Accept (advance to Send Documents) or Reject (archive with email)."
    >
      <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))]">
        {loading && <p className="p-8 text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="p-10 text-center text-sm text-[hsl(var(--tp-text-dim))] italic">
            Inbox zero. Nothing to review.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="p-5 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="tp-chip text-[10px] uppercase tracking-wider">PRF</span>
                {r.status === "reviewing" && (
                  <span className="tp-chip text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold-soft))]">
                    Reviewing
                  </span>
                )}
                <p className="font-display text-sm font-semibold text-[hsl(var(--tp-text))] truncate">
                  {r.company_name || r.product_name || "(unnamed)"}
                </p>
              </div>
              <p className="text-xs text-[hsl(var(--tp-text-muted))]">
                {[r.founder_name, r.email, r.phone].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[11px] mt-1 text-[hsl(var(--tp-text-dim))]">
                Received {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setOpenId(r.id)} className="tp-btn">
                <Eye className="w-3.5 h-3.5" /> Open PRF
              </button>
              <button onClick={() => accept(r)} className="tp-btn tp-btn-primary">
                <Check className="w-3.5 h-3.5" /> Accept
              </button>
              <button
                onClick={() => setRejecting(r)}
                disabled={!r.email}
                className="tp-btn disabled:opacity-40"
                title={!r.email ? "No email on file — cannot send rejection" : "Reject and email"}
              >
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>

      <PrfReviewPanel prfId={openId} onClose={() => { setOpenId(null); load(); }} />
      {rejecting && (
        <RejectEmailDialog
          open={!!rejecting}
          onClose={() => setRejecting(null)}
          onConfirmed={() => { setRejecting(null); load(); }}
          prfId={rejecting.id}
          to={rejecting.email!}
          contactName={rejecting.founder_name}
          companyName={rejecting.company_name}
          productName={rejecting.product_name}
        />
      )}
    </TeamPage>
  );
};

export default SalesDocumentsInbox;
