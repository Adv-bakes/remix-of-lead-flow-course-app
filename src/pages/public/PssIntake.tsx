import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, CheckCircle2, FileSignature, Plus } from "lucide-react";
import { PssWizard, type PssData } from "@/components/pss/PssWizard";

interface TokenInfo {
  valid: boolean;
  expired: boolean;
  lead_id: string | null;
  prospect_email: string | null;
  company_name: string | null;
  contact_name: string | null;
}

interface PssRow {
  id: string;
  status: string;
  product_label: string | null;
  updated_at: string;
  submitted_at: string | null;
}

const PssIntake = () => {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [submissions, setSubmissions] = useState<PssRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<PssData | null>(null);
  const [activeLabel, setActiveLabel] = useState<string>("");
  const [ndaUploading, setNdaUploading] = useState(false);
  const [ndaUploaded, setNdaUploaded] = useState(false);

  // Resolve token + list drafts.
  const reload = useCallback(async () => {
    if (!token) return;
    const { data: t } = await (supabase as any).rpc("validate_send_token", { _token: token });
    const row = Array.isArray(t) ? t[0] : t;
    setInfo(row || { valid: false, expired: false });
    if (!row?.valid || row.expired) return;

    const { data: list } = await (supabase as any).rpc("list_pss_for_token", { _token: token });
    let rows: PssRow[] = list || [];
    if (rows.length === 0) {
      // Create the first draft on-demand.
      const { data: newId } = await (supabase as any).rpc("create_pss_draft_for_token", {
        _token: token,
        _product_label: null,
      });
      if (newId) {
        const { data: list2 } = await (supabase as any).rpc("list_pss_for_token", { _token: token });
        rows = list2 || [];
      }
    }
    setSubmissions(rows);
    const firstDraft = rows.find((r) => r.status === "draft") || rows[0];
    if (firstDraft) await openSubmission(firstDraft.id);
  }, [token]);

  const openSubmission = async (id: string) => {
    if (!token) return;
    const { data } = await (supabase as any).rpc("get_pss_draft_public", { _id: id, _token: token });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return;
    setActiveId(id);
    setActiveData((row.data_json as PssData) || ({} as PssData));
    setActiveLabel(row.product_label || "");
  };

  useEffect(() => { reload(); }, [reload]);

  const handleNdaUpload = async (file: File) => {
    if (!info?.lead_id) return;
    setNdaUploading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${info.lead_id}/nda_signed_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-spec-sheets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("client_documents").insert({
        id: crypto.randomUUID(),
        user_id: info.lead_id,
        document_type: "nda",
        file_name: file.name,
        file_path: path,
        uploaded_at: new Date().toISOString(),
        uploaded_by: info.prospect_email,
        review_status: "pending",
      });
      if (insErr) throw insErr;
      setNdaUploaded(true);
      toast.success("Signed NDA received — thank you");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setNdaUploading(false);
    }
  };

  const addAnotherProduct = async () => {
    if (!token) return;
    const label = window.prompt("Label for this product (e.g. 'Chocolate Chip')") || null;
    const { data: newId } = await (supabase as any).rpc("create_pss_draft_for_token", {
      _token: token,
      _product_label: label,
    });
    if (newId) {
      await reload();
      await openSubmission(newId);
    }
  };

  if (!info) {
    return <CenteredMessage title="Loading…" />;
  }
  if (!info.valid) {
    return <CenteredMessage title="Link not recognized" body="This link is invalid. Please check the email or contact Adventure Bakery." />;
  }
  if (info.expired) {
    return <CenteredMessage title="Link expired" body="Please reply to your email and we'll send you a fresh link." />;
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--tp-bg))] text-[hsl(var(--tp-text))]">
      <header className="border-b border-[hsl(var(--tp-hairline))] px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <p className="font-display text-lg font-semibold">Adventure Bakery</p>
          <p className="text-xs text-[hsl(var(--tp-text-dim))]">
            Welcome{info.contact_name ? `, ${info.contact_name}` : ""} — secure intake for {info.company_name || info.prospect_email}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* PANEL A — NDA upload */}
        <section className="tp-surface p-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileSignature className="w-4 h-4 text-[hsl(var(--tp-gold))]" />
                <h2 className="font-display text-base font-semibold">1. Signed NDA</h2>
              </div>
              <p className="text-xs text-[hsl(var(--tp-text-muted))] max-w-xl">
                Sign the NDA PDF (attached to your email), then upload it here.
              </p>
            </div>
            {ndaUploaded ? (
              <span className="tp-chip text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold))]">
                <CheckCircle2 className="w-3 h-3 inline mr-1" /> Received
              </span>
            ) : (
              <label className="tp-btn tp-btn-primary cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {ndaUploading ? "Uploading…" : "Upload signed NDA"}
                <input
                  type="file"
                  className="hidden"
                  accept="application/pdf"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleNdaUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>
        </section>

        {/* PANEL B — PSS wizard */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold">2. Product Spec Sheet</h2>
            <div className="flex items-center gap-2">
              {submissions.length > 1 && (
                <select
                  className="tp-input"
                  value={activeId || ""}
                  onChange={(e) => openSubmission(e.target.value)}
                >
                  {submissions.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      {s.product_label || `Product ${i + 1}`} {s.status === "submitted" ? "(submitted)" : ""}
                    </option>
                  ))}
                </select>
              )}
              <button className="tp-btn" onClick={addAnotherProduct}>
                <Plus className="w-3.5 h-3.5" /> Add another product
              </button>
            </div>
          </div>

          {activeId && activeData && (
            <PssWizard
              key={activeId}
              id={activeId}
              token={token!}
              initialData={activeData}
              initialProductLabel={activeLabel}
              prefill={{ company_name: info.company_name || undefined, customer_name: info.contact_name || undefined }}
              onSubmitted={async () => { await reload(); }}
            />
          )}
        </section>

        <p className="text-center text-[11px] text-[hsl(var(--tp-text-dim))] py-8">
          Adventure Bakery · Your link is private. Bookmark it to resume any time.
        </p>
      </main>
    </div>
  );
};

const CenteredMessage = ({ title, body }: { title: string; body?: string }) => (
  <div className="min-h-screen bg-[hsl(var(--tp-bg))] text-[hsl(var(--tp-text))] flex items-center justify-center px-6">
    <div className="tp-surface p-8 max-w-md text-center">
      <h1 className="font-display text-xl font-semibold mb-2">{title}</h1>
      {body && <p className="text-sm text-[hsl(var(--tp-text-muted))]">{body}</p>}
    </div>
  </div>
);

export default PssIntake;
