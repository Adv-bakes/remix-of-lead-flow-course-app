import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Check, AlertTriangle, Sparkles, Download, Copy } from "lucide-react";

interface Props {
  documentId: string | null;
  onClose: () => void;
  onDecided?: () => void;
}

export const DocumentReviewPanel = ({ documentId, onClose, onDecided }: Props) => {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<{ provider: string; model: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!documentId) { setDoc(null); setSignedUrl(null); return; }
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("client_documents")
        .select("*")
        .eq("id", documentId)
        .maybeSingle();
      setDoc(data);
      if (data?.file_path) {
        const { data: signed } = await supabase.storage
          .from("product-spec-sheets")
          .createSignedUrl(data.file_path, 600);
        setSignedUrl(signed?.signedUrl || null);
      }
      setLoading(false);
    })();
  }, [documentId]);

  const runAI = async () => {
    if (!documentId) return;
    setReviewing(true);
    const { error, data } = await supabase.functions.invoke("review-client-document", {
      body: { document_id: documentId },
    });
    setReviewing(false);
    if (error) return toast.error(error.message || "AI review failed");
    if (data?.error) return toast.error(data.error);
    if (data?.provider) setProvider({ provider: data.provider, model: data.model });
    toast.success("AI review complete");
    // Refresh
    const { data: fresh } = await supabase
      .from("client_documents")
      .select("*")
      .eq("id", documentId)
      .maybeSingle();
    setDoc(fresh);
  };

  const decide = async (status: "approved" | "rejected") => {
    if (!documentId || !doc) return;
    setBusy(true);

    const { error } = await supabase
      .from("client_documents")
      .update({
        review_status: status,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }

    // PSS approved → kick off batch sheet generation, and check if both NDA+PSS approved for this user → advance stage
    const docType = (doc.document_type || "").toLowerCase();
    if (status === "approved" && docType === "pss") {
      const { error: bsErr } = await supabase.functions.invoke("generate-batch-sheet-from-pss", {
        body: { pss_document_id: documentId },
      });
      if (bsErr) toast.warning("PSS approved but batch sheet draft failed — you can retry from the project.");
    }

    if (status === "approved" && doc.user_id) {
      // Always log per-doc approval
      await supabase.from("client_activity").insert({
        client_id: doc.user_id,
        action: `${docType}_approved`,
        payload: { document_id: documentId, file_name: doc.file_name },
      });

      // Check if this client has an approved NDA AND approved PSS
      const { data: clientDocs } = await supabase
        .from("client_documents")
        .select("document_type, review_status")
        .eq("user_id", doc.user_id);
      const approved = (clientDocs || []).filter((d) => d.review_status === "approved");
      const hasNda = approved.some((d) => (d.document_type || "").toLowerCase() === "nda");
      const hasPss = approved.some((d) => (d.document_type || "").toLowerCase() === "pss");
      // include the one we just approved (in case the read raced)
      const justNda = docType === "nda";
      const justPss = docType === "pss";
      if ((hasNda || justNda) && (hasPss || justPss)) {
        await (supabase as any)
          .from("sales_leads")
          .update({ stage: "Follow-Up", stage_updated_at: new Date().toISOString() })
          .eq("profile_id", doc.user_id)
          .eq("stage", "Send Documents");
        await supabase.from("client_activity").insert({
          client_id: doc.user_id,
          action: "documents_completed",
          payload: { trigger_doc_id: documentId },
        });
        toast.success("Both docs approved — moved to Follow-Up");
      } else {
        toast.success(`${docType.toUpperCase()} approved`);
      }
    } else if (status === "rejected") {
      if (doc.user_id) {
        await supabase.from("client_activity").insert({
          client_id: doc.user_id,
          action: `${docType}_rejected`,
          payload: { document_id: documentId, file_name: doc.file_name },
        });
      }
      toast.success("Document rejected — client can resubmit");
    } else {
      if (doc.user_id) {
        await supabase.from("client_activity").insert({
          client_id: doc.user_id,
          action: `${docType}_approved`,
          payload: { document_id: documentId, file_name: doc.file_name },
        });
      }
      toast.success("Approved");
    }

    setBusy(false);
    onDecided?.();
    onClose();
  };

  if (!documentId) return null;

  const notes = doc?.review_notes || {};
  const docType = (doc?.document_type || "").toLowerCase();
  const status = doc?.review_status;

  return (
    <div className="fixed inset-0 z-50 team-portal" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-0 top-0 h-full w-full max-w-[680px] tp-surface border-l border-[hsl(var(--tp-hairline))] overflow-y-auto"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--tp-hairline))] bg-[hsl(var(--tp-surface))]/95 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))]">
              Document review · {docType.toUpperCase()}
            </p>
            <h2 className="font-display text-lg text-[hsl(var(--tp-text))] truncate">
              {doc?.file_name || doc?.file_path || "Loading…"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {signedUrl && (
              <a href={signedUrl} target="_blank" rel="noreferrer" className="tp-btn">
                <Download className="w-3.5 h-3.5" /> File
              </a>
            )}
            <button onClick={onClose} className="tp-btn" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading && <p className="text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>}

          {/* AI review button */}
          {!notes || Object.keys(notes).length === 0 ? (
            <div className="tp-surface p-5 border border-dashed border-[hsl(var(--tp-hairline))]">
              <p className="text-sm text-[hsl(var(--tp-text-muted))] mb-3">
                No AI review yet. Run the review to extract data and check completeness.
              </p>
              <button onClick={runAI} disabled={reviewing} className="tp-btn tp-btn-primary disabled:opacity-50">
                <Sparkles className="w-3.5 h-3.5" />
                {reviewing ? "Reviewing…" : "Run AI review"}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className={`tp-chip text-[11px] ${
                  status === "ai_passed" ? "text-[hsl(var(--tp-gold))]" :
                  status === "ai_flagged" ? "text-[hsl(var(--tp-warning))]" :
                  status === "approved" ? "text-green-400" :
                  status === "rejected" ? "text-red-400" : ""
                }`}>
                  {status === "ai_passed" && <Check className="w-3 h-3 inline mr-1" />}
                  {status === "ai_flagged" && <AlertTriangle className="w-3 h-3 inline mr-1" />}
                  {status}
                </span>
                <button onClick={runAI} disabled={reviewing} className="tp-btn text-[11px] disabled:opacity-50">
                  <Sparkles className="w-3 h-3" /> Re-run
                </button>
              </div>

              {notes.summary && (
                <div className="tp-surface p-4">
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Summary</p>
                  <p className="text-sm text-[hsl(var(--tp-text))]">{notes.summary}</p>
                </div>
              )}

              {/* NDA-specific */}
              {docType === "nda" && (
                <div className="tp-surface p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">NDA fields</p>
                  <Row k="Fully executed" v={notes.fully_executed ? "Yes" : "No"} good={notes.fully_executed} />
                  <Row k="Signer" v={notes.signer_name || "—"} />
                  <Row k="Company" v={notes.company || "—"} />
                  <Row k="Date" v={notes.date || "—"} />
                  <Row k="Signature present" v={notes.signature_present ? "Yes" : "No"} good={notes.signature_present} />
                </div>
              )}

              {/* PSS-specific */}
              {docType === "pss" && notes.has_required && (
                <div className="tp-surface p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-1">Required fields</p>
                  {Object.entries(notes.has_required).map(([k, v]) => (
                    <Row key={k} k={pssLabel(k)} v={v ? "Present" : "Missing"} good={!!v} />
                  ))}
                </div>
              )}

              {docType === "pss" && (notes.services_to_offer?.length ?? 0) > 0 && (
                <div className="tp-surface p-4 border border-[hsl(var(--tp-gold))]/30">
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold))] mb-2">
                    Services we can offer this client
                  </p>
                  <ul className="text-sm text-[hsl(var(--tp-text))] space-y-1 list-disc pl-5">
                    {notes.services_to_offer.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}

              {(notes.issues?.length ?? 0) > 0 && (
                <div className="tp-surface p-4 border border-[hsl(var(--tp-warning))]/30">
                  <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-warning))] mb-2">Issues</p>
                  <ul className="text-sm text-[hsl(var(--tp-text))] space-y-1 list-disc pl-5">
                    {notes.issues.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Decision buttons */}
          {status !== "approved" && status !== "rejected" && (
            <div className="flex items-center gap-2 pt-2">
              <button onClick={() => decide("approved")} disabled={busy} className="tp-btn tp-btn-primary disabled:opacity-50">
                <Check className="w-3.5 h-3.5" /> Approve
              </button>
              <button onClick={() => decide("rejected")} disabled={busy} className="tp-btn disabled:opacity-50">
                <X className="w-3.5 h-3.5" /> Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Row({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[hsl(var(--tp-text-dim))]">{k}</span>
      <span className={good === true ? "text-green-400" : good === false ? "text-[hsl(var(--tp-warning))]" : "text-[hsl(var(--tp-text))]"}>
        {v}
      </span>
    </div>
  );
}

function pssLabel(k: string): string {
  return ({
    company: "Company",
    product: "Product",
    recipe: "Recipe",
    process: "Process",
    size_weight: "Size & weight",
    units_per_primary: "Units / primary pack",
    units_per_retail: "Units / retail unit",
    signature: "Signature",
  } as any)[k] || k;
}
