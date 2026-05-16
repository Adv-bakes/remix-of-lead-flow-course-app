import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage } from "@/components/team/TeamPage";
import { PrfReviewPanel } from "@/components/sales/PrfReviewPanel";
import { RejectEmailDialog } from "@/components/sales/RejectEmailDialog";
import { DocumentReviewPanel } from "@/components/sales/DocumentReviewPanel";
import { Eye, Check, X, FileSignature, FileCheck2 } from "lucide-react";

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
  const [docRows, setDocRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PrfRow | null>(null);

  const load = async () => {
    setLoading(true);
    const [prfRes, docRes] = await Promise.all([
      supabase
        .from("prf_submissions")
        .select("id, product_name, company_name, founder_name, email, phone, status, created_at")
        .in("status", ["new", "reviewing"])
        .order("created_at", { ascending: false }),
      supabase
        .from("client_documents")
        .select("id, document_type, file_name, file_path, uploaded_at, user_id, review_status, review_notes")
        .or("document_type.eq.nda,document_type.eq.pss,document_type.eq.NDA,document_type.eq.PSS")
        .in("review_status", ["pending", "ai_passed", "ai_flagged"])
        .order("uploaded_at", { ascending: false }),
    ]);
    if (prfRes.error) toast.error(prfRes.error.message);
    setRows((prfRes.data || []) as any);

    // Enrich docs with lead/company info
    const docs = docRes.data || [];
    const userIds = Array.from(new Set(docs.map((d) => d.user_id).filter(Boolean)));
    let leadMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: leads } = await (supabase as any)
        .from("sales_leads")
        .select("profile_id, company_name, contact_name, email")
        .in("profile_id", userIds);
      leadMap = Object.fromEntries((leads || []).map((l: any) => [l.profile_id, l]));
    }
    setDocRows(docs.map((d) => ({ ...d, lead: leadMap[d.user_id || ""] || null })));
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
      description="Review PRFs, then triage returned NDA and PSS documents."
    >
      {/* Lane 1 — PRFs */}
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))] mb-2">
        PRFs to review {rows.length > 0 && <span className="text-[hsl(var(--tp-gold))]">· {rows.length}</span>}
      </h2>
      <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))] mb-8">
        {loading && <p className="p-8 text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="p-8 text-center text-sm text-[hsl(var(--tp-text-dim))] italic">
            No PRFs awaiting review.
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

      {/* Lane 2 — Returned NDA / PSS */}
      <h2 className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))] mb-2">
        Returned documents (NDA / PSS) {docRows.length > 0 && <span className="text-[hsl(var(--tp-gold))]">· {docRows.length}</span>}
      </h2>
      <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))]">
        {!loading && docRows.length === 0 && (
          <p className="p-8 text-center text-sm text-[hsl(var(--tp-text-dim))] italic">
            No returned documents awaiting review.
          </p>
        )}
        {docRows.map((d) => {
          const type = (d.document_type || "").toLowerCase();
          const Icon = type === "nda" ? FileSignature : FileCheck2;
          return (
            <div key={d.id} className="p-5 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="tp-chip text-[10px] uppercase tracking-wider">
                    <Icon className="w-3 h-3 inline mr-1" />{type.toUpperCase()}
                  </span>
                  {d.review_status === "ai_flagged" && (
                    <span className="tp-chip text-[10px] uppercase tracking-wider text-[hsl(var(--tp-warning))]">AI flagged</span>
                  )}
                  {d.review_status === "ai_passed" && (
                    <span className="tp-chip text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold))]">AI passed</span>
                  )}
                  {d.review_status === "pending" && (
                    <span className="tp-chip text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">Not reviewed</span>
                  )}
                  <p className="font-display text-sm font-semibold text-[hsl(var(--tp-text))] truncate">
                    {d.lead?.company_name || d.lead?.email || d.file_name || "(unknown client)"}
                  </p>
                </div>
                <p className="text-xs text-[hsl(var(--tp-text-muted))]">
                  {[d.lead?.contact_name, d.lead?.email, d.file_name].filter(Boolean).join(" · ")}
                </p>
                <p className="text-[11px] mt-1 text-[hsl(var(--tp-text-dim))]">
                  Uploaded {d.uploaded_at ? new Date(d.uploaded_at).toLocaleString() : "—"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setOpenDocId(d.id)} className="tp-btn tp-btn-primary">
                  <Eye className="w-3.5 h-3.5" /> Review
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <PrfReviewPanel prfId={openId} onClose={() => { setOpenId(null); load(); }} />
      <DocumentReviewPanel documentId={openDocId} onClose={() => setOpenDocId(null)} onDecided={load} />
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
