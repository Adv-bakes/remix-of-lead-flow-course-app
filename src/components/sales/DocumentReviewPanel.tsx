import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Check, AlertTriangle, Sparkles, Download, Copy, ExternalLink } from "lucide-react";

const mimeForExt = (name: string): string => {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
};

const openAsBlob = async (url: string, name: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open failed (${res.status})`);
    const buf = await res.arrayBuffer();
    const blob = new Blob([buf], { type: mimeForExt(name) });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  } catch (e: any) {
    toast.error(e?.message || "Could not open — try the direct link instead");
  }
};

interface Props {
  documentId: string | null;
  onClose: () => void;
  onDecided?: () => void;
}

export const DocumentReviewPanel = ({ documentId, onClose, onDecided }: Props) => {
  const navigate = useNavigate();
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
    let batchSheetId: string | null = null;
    if (status === "approved" && docType === "pss") {
      const { error: bsErr, data: bsData } = await supabase.functions.invoke("generate-batch-sheet-from-pss", {
        body: { pss_document_id: documentId },
      });
      if (bsErr) toast.warning("PSS approved but batch sheet draft failed — you can retry from the project.");
      else batchSheetId = (bsData as any)?.batch_sheet?.id || null;
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
    }

    setBusy(false);
    onDecided?.();
    onClose();

    // Navigate to the client folder after PSS approval so the salesperson lands in context
    if (status === "approved" && docType === "pss" && doc.user_id) {
      const { data: lead } = await (supabase as any)
        .from("sales_leads")
        .select("id")
        .eq("profile_id", doc.user_id)
        .maybeSingle();
      if (lead?.id) {
        navigate(`/team/sales/clients/${lead.id}`);
        if (batchSheetId) toast.success(`Batch sheet v1 created — open it from the project workspace.`);
      } else {
        toast.info("Approved, but no client folder linked to this document yet.");
      }
    }
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
              <>
                <button
                  onClick={() => openAsBlob(signedUrl, doc?.file_name || "file")}
                  className="tp-btn"
                  title="Open in a new tab with the correct file type"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View
                </button>
                <a href={signedUrl} target="_blank" rel="noreferrer" className="tp-btn" title="Direct signed link (fallback)">
                  <Download className="w-3.5 h-3.5" /> Direct
                </a>
              </>
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
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
                <div className="flex items-center gap-2">
                  {provider && (
                    <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">
                      AI · {provider.provider} · {provider.model}
                    </span>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(notes, null, 2));
                      toast.success("Raw JSON copied");
                    }}
                    className="tp-btn text-[11px]"
                    title="Copy raw AI verdict JSON"
                  >
                    <Copy className="w-3 h-3" /> JSON
                  </button>
                  <button onClick={() => setShowRaw((v) => !v)} className="tp-btn text-[11px]">
                    {showRaw ? "Hide" : "Show"} raw
                  </button>
                  <button onClick={runAI} disabled={reviewing} className="tp-btn text-[11px] disabled:opacity-50">
                    <Sparkles className="w-3 h-3" /> Re-run
                  </button>
                </div>
              </div>

              {showRaw && (
                <pre className="tp-surface p-3 text-[10px] overflow-x-auto text-[hsl(var(--tp-text-dim))] whitespace-pre-wrap">
                  {JSON.stringify(notes, null, 2)}
                </pre>
              )}

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

              {docType === "pss" && notes.extracted && (() => {
                const ex = notes.extracted;
                const ings = ex?.recipe?.ingredients || ex?.ingredients || [];
                const total = ex?.recipe?.total_batch_weight;
                let sumPct = 0;
                let computedCount = 0;
                if (total && total > 0) {
                  for (const i of ings) if (typeof i.weight === "number") { sumPct += (i.weight / total) * 100; computedCount++; }
                } else {
                  for (const i of ings) if (typeof i.percentage === "number") { sumPct += i.percentage; computedCount++; }
                }
                const pctOk = computedCount > 0 && Math.abs(sumPct - 100) <= 0.05;
                const steps = ex?.process?.pre_bake?.steps || ex?.process_steps || [];
                const method = ex?.process?.method;
                const used = new Set<string>();
                for (const s of steps) for (const n of (s?.ingredients_added || [])) used.add(String(n).toLowerCase().trim());
                const names = new Set(ings.map((i: any) => (i.name || "").toLowerCase().trim()));
                const coverageOk = names.size > 0 && [...names].every((n) => used.has(n as string));
                const packing = ex?.packaging?.primary?.vessel || ex?.packaging?.secondary?.type;
                return (
                  <div className="tp-surface p-4 border border-[hsl(var(--tp-gold))]/20 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold))]">
                      Will populate batch sheet
                    </p>
                    <div className="text-sm text-[hsl(var(--tp-text))] space-y-1">
                      <div>
                        Recipe: <span className="text-[hsl(var(--tp-text-dim))]">{ings.length} ingredients</span>
                        {computedCount > 0 && (
                          <span className={pctOk ? "text-green-400 ml-2" : "text-[hsl(var(--tp-warning))] ml-2"}>
                            · Σ = {sumPct.toFixed(2)}% {pctOk ? "✓" : "⚠"}
                          </span>
                        )}
                        <span className="text-[hsl(var(--tp-text-dim))] ml-2">· locked 🔒</span>
                      </div>
                      <div>
                        Process: <span className="text-[hsl(var(--tp-text-dim))]">
                          {method || "method TBD"} · {steps.length} step{steps.length === 1 ? "" : "s"}
                        </span>
                        {names.size > 0 && (
                          <span className={coverageOk ? "text-green-400 ml-2" : "text-[hsl(var(--tp-warning))] ml-2"}>
                            · coverage {coverageOk ? "✓" : "⚠"}
                          </span>
                        )}
                      </div>
                      <div>
                        Packaging: <span className="text-[hsl(var(--tp-text-dim))]">
                          {packing || "TBD → offered as service"}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-[hsl(var(--tp-text-dim))] pt-2 border-t border-[hsl(var(--tp-hairline))]">
                      On approval, a confidential staff-only formula will be created. Ingredient weights are locked on the batch sheet — all other fields editable by the AB team.
                    </p>
                  </div>
                );
              })()}

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
