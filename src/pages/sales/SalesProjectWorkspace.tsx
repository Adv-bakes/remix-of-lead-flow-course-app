import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamPage } from "@/components/team/TeamPage";
import { PrfReviewPanel } from "@/components/sales/PrfReviewPanel";
import { ArrowLeft, FileText, FileCheck2, FileSignature, FlaskConical, ExternalLink, Send, Upload, Download, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { fetchActiveTemplates, downloadTemplate, type ActiveTemplate, type TemplateKind } from "@/lib/templates";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TABS = ["concept", "ingredients", "formulas", "packaging", "shelf-life", "products", "costing", "notes"] as const;

const SalesProjectWorkspace = () => {
  const { leadId, prfId } = useParams();
  const [prf, setPrf] = useState<any>(null);
  const [lead, setLead] = useState<any>(null);
  const [pss, setPss] = useState<any>(null);
  const [nda, setNda] = useState<any>(null);
  const [batchSheet, setBatchSheet] = useState<any>(null);
  const [openPrf, setOpenPrf] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Record<TemplateKind, ActiveTemplate | null> | null>(null);
  const [uploadingKind, setUploadingKind] = useState<"pss" | "nda" | null>(null);
  const pssInputRef = useRef<HTMLInputElement>(null);
  const ndaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (!prfId || !leadId) return;
      setLoading(true);
      const [prfRes, leadRes] = await Promise.all([
        supabase.from("prf_submissions").select("*").eq("id", prfId).maybeSingle(),
        (supabase as any).from("sales_leads").select("*").eq("id", leadId).maybeSingle(),
      ]);
      setPrf(prfRes.data);
      setLead(leadRes.data);

      if (leadRes.data?.profile_id) {
        const { data: docs } = await supabase
          .from("client_documents")
          .select("*")
          .eq("user_id", leadRes.data.profile_id)
          .order("uploaded_at", { ascending: false });
        const pssDoc = (docs || []).find((d) => (d.document_type || "").toLowerCase() === "pss" && d.review_status === "approved")
          || (docs || []).find((d) => (d.document_type || "").toLowerCase() === "pss");
        const ndaDoc = (docs || []).find((d) => (d.document_type || "").toLowerCase() === "nda" && d.review_status === "approved")
          || (docs || []).find((d) => (d.document_type || "").toLowerCase() === "nda");
        setPss(pssDoc || null);
        setNda(ndaDoc || null);

        if (pssDoc?.id) {
          const { data: bs } = await (supabase as any)
            .from("batch_sheets")
            .select("*")
            .eq("pss_document_id", pssDoc.id)
            .maybeSingle();
          setBatchSheet(bs || null);
        }
      }
      setLoading(false);
    })();
  }, [leadId, prfId]);

  useEffect(() => { fetchActiveTemplates().then(setTemplates); }, []);

  const refreshDocs = async () => {
    if (!lead?.profile_id) return;
    const { data: docs } = await supabase
      .from("client_documents")
      .select("*")
      .eq("user_id", lead.profile_id)
      .order("uploaded_at", { ascending: false });
    const pssDoc = (docs || []).find((d) => (d.document_type || "").toLowerCase() === "pss" && d.review_status === "approved")
      || (docs || []).find((d) => (d.document_type || "").toLowerCase() === "pss");
    const ndaDoc = (docs || []).find((d) => (d.document_type || "").toLowerCase() === "nda" && d.review_status === "approved")
      || (docs || []).find((d) => (d.document_type || "").toLowerCase() === "nda");
    setPss(pssDoc || null);
    setNda(ndaDoc || null);
  };

  const uploadDoc = async (kind: "pss" | "nda", file: File) => {
    if (!lead?.profile_id) return toast.error("This lead has no client profile yet — cannot attach documents.");
    setUploadingKind(kind);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${lead.profile_id}/${kind}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("product-spec-sheets")
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) throw upErr;
      const { data: u } = await supabase.auth.getUser();
      const { error: insErr } = await (supabase as any).from("client_documents").insert({
        id: crypto.randomUUID(),
        user_id: lead.profile_id,
        uploaded_by: u.user?.id || null,
        document_type: kind,
        file_path: path,
        file_name: file.name,
        uploaded_at: new Date().toISOString(),
        review_status: "pending",
      });
      if (insErr) throw insErr;
      toast.success(`${kind.toUpperCase()} uploaded — review it in the Documents Inbox.`);
      await refreshDocs();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploadingKind(null);
    }
  };

  const openSigned = async (doc: any) => {
    if (!doc?.file_path) return toast.error("No file on record");
    const { data, error } = await supabase.storage
      .from("product-spec-sheets")
      .createSignedUrl(doc.file_path, 600);
    if (error || !data?.signedUrl) return toast.error("Could not generate signed link");
    window.open(data.signedUrl, "_blank");
  };

  const generateBatchSheet = async () => {
    if (!pss?.id) return toast.error("No PSS on file");
    setGeneratingBatch(true);
    const { data, error } = await supabase.functions.invoke("generate-batch-sheet-from-pss", {
      body: { pss_document_id: pss.id },
    });
    setGeneratingBatch(false);
    if (error) return toast.error(error.message || "Failed to generate batch sheet");
    toast.success("Batch sheet generated");
    const { data: bs } = await (supabase as any)
      .from("batch_sheets")
      .select("*")
      .eq("pss_document_id", pss.id)
      .maybeSingle();
    setBatchSheet(bs || null);
    setBatchOpen(true);
  };

  if (loading) return <TeamPage title="Loading…">…</TeamPage>;
  if (!prf || !lead) return (
    <TeamPage title="Not found">
      <Link to={`/team/sales/clients/${leadId || ""}`} className="tp-btn"><ArrowLeft className="w-4 h-4" /> Back</Link>
    </TeamPage>
  );

  return (
    <TeamPage
      eyebrow={lead.company_name || lead.email}
      title={prf.product_name || "(unnamed project)"}
      description={`${prf.project_type || ""} · submitted ${new Date(prf.created_at).toLocaleDateString()}`}
      actions={
        <Link to={`/team/sales/clients/${leadId}`} className="tp-btn"><ArrowLeft className="w-4 h-4" /> Back to folder</Link>
      }
    >
      {/* Header quick-doc strip */}
      <div className="tp-surface p-4 mb-6 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))] mr-2">Quick docs</span>
        <button onClick={() => setOpenPrf(true)} className="tp-btn">
          <FileText className="w-3.5 h-3.5" /> PRF
        </button>

        {/* PSS — view only when present */}
        {pss && (
          <button onClick={() => openSigned(pss)} className="tp-btn" title="Open PSS">
            <FileCheck2 className="w-3.5 h-3.5" /> PSS
            {pss.review_status !== "approved" && <span className="text-[10px] text-[hsl(var(--tp-warning))]">·{pss.review_status}</span>}
          </button>
        )}

        {/* NDA — view only when present */}
        {nda && (
          <button onClick={() => openSigned(nda)} className="tp-btn" title="Open NDA">
            <FileSignature className="w-3.5 h-3.5" /> NDA
            {nda.review_status !== "approved" && <span className="text-[10px] text-[hsl(var(--tp-warning))]">·{nda.review_status}</span>}
          </button>
        )}

        {/* Hidden file inputs powering the Upload Form dropdown */}
        <input
          ref={pssInputRef}
          type="file"
          accept=".pdf,.xlsx,.xls,.doc,.docx"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc("pss", f); e.target.value = ""; }}
        />
        <input
          ref={ndaInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc("nda", f); e.target.value = ""; }}
        />

        {/* Download Templates dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="tp-btn">
              <Download className="w-3.5 h-3.5" /> Download Templates <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-50 bg-[hsl(var(--tp-surface-3))] border border-[hsl(var(--tp-hairline-strong))] text-[hsl(var(--tp-text))] shadow-2xl">
            <DropdownMenuItem disabled={!templates?.prf_template} onClick={() => downloadTemplate(templates?.prf_template ?? null, "prf_template")}>
              <FileText className="w-3.5 h-3.5 mr-2" /> Blank PRF
              {!templates?.prf_template && <span className="ml-2 text-[10px] opacity-60">not uploaded</span>}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!templates?.nda} onClick={() => downloadTemplate(templates?.nda ?? null, "nda")}>
              <FileSignature className="w-3.5 h-3.5 mr-2" /> NDA
              {!templates?.nda && <span className="ml-2 text-[10px] opacity-60">not uploaded</span>}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!templates?.pss_workbook} onClick={() => downloadTemplate(templates?.pss_workbook ?? null, "pss_workbook")}>
              <FileCheck2 className="w-3.5 h-3.5 mr-2" /> PSS workbook
              {!templates?.pss_workbook && <span className="ml-2 text-[10px] opacity-60">not uploaded</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Upload Form dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="tp-btn" disabled={uploadingKind !== null}>
              <Upload className="w-3.5 h-3.5" /> {uploadingKind ? "Uploading…" : "Upload Form"} <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-50 bg-[hsl(var(--tp-surface-3))] border border-[hsl(var(--tp-hairline-strong))] text-[hsl(var(--tp-text))] shadow-2xl">
            <DropdownMenuItem onClick={() => pssInputRef.current?.click()}>
              <FileCheck2 className="w-3.5 h-3.5 mr-2" /> Upload PSS
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => ndaInputRef.current?.click()}>
              <FileSignature className="w-3.5 h-3.5 mr-2" /> Upload NDA
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Batch sheet — always visible */}
        {batchSheet ? (
          <button onClick={() => setBatchOpen(true)} className="tp-btn border-[hsl(var(--tp-gold))]/40" title="Open internal batch sheet">
            <FlaskConical className="w-3.5 h-3.5 text-[hsl(var(--tp-gold))]" />
            <span className="text-[hsl(var(--tp-gold))]">Open Batch Sheet</span>
            <span className="text-[9px] text-[hsl(var(--tp-text-dim))]">internal</span>
          </button>
        ) : (
          <button
            onClick={generateBatchSheet}
            disabled={!pss?.id || pss?.review_status !== "approved" || generatingBatch}
            className="tp-btn disabled:opacity-40 border-[hsl(var(--tp-gold))]/40"
            title={!pss ? "Upload a PSS first" : pss.review_status !== "approved" ? "Approve the PSS in Documents Inbox first" : "Generate batch sheet from approved PSS"}
          >
            <FlaskConical className="w-3.5 h-3.5 text-[hsl(var(--tp-gold))]" />
            <span className="text-[hsl(var(--tp-gold))]">
              {generatingBatch
                ? "Generating…"
                : !pss
                ? "Upload PSS to generate batch sheet"
                : pss.review_status !== "approved"
                ? "Approve PSS to generate batch sheet"
                : "Generate Batch Sheet"}
            </span>
          </button>
        )}

        <button
          onClick={() => toast.info("Send-to-client emails are coming in the next pass.")}
          className="tp-btn ml-auto"
        >
          <Send className="w-3.5 h-3.5" /> Send to client
        </button>
      </div>

      {!pss && (
        <div className="tp-surface p-4 mb-6 border border-[hsl(var(--tp-warning))]/30">
          <p className="text-sm text-[hsl(var(--tp-text))]">
            <span className="text-[hsl(var(--tp-warning))]">No PSS on file yet.</span>{" "}
            Once the client returns the PSS and it's approved in the inbox, the batch sheet and recipe data will appear here automatically.
          </p>
        </div>
      )}
      {pss && pss.review_status !== "approved" && (
        <div className="tp-surface p-4 mb-6 border border-[hsl(var(--tp-gold))]/30">
          <p className="text-sm text-[hsl(var(--tp-text))]">
            PSS uploaded but not yet approved (<span className="text-[hsl(var(--tp-gold))]">{pss.review_status}</span>). Review it in the{" "}
            <Link to="/team/sales/inbox" className="underline">Documents Inbox</Link>.
          </p>
        </div>
      )}

      <Tabs defaultValue="concept">
        <TabsList className="tp-surface mb-4 flex-wrap h-auto">
          <TabsTrigger value="concept">Concept</TabsTrigger>
          <TabsTrigger value="ingredients">Ingredients</TabsTrigger>
          <TabsTrigger value="formulas">Formulas</TabsTrigger>
          <TabsTrigger value="packaging">Packaging</TabsTrigger>
          <TabsTrigger value="shelf-life">Shelf Life</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="costing">Costing</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="concept">
          <ScopedReadCard
            title="Concept"
            empty="No concept linked yet. Concept will be created when the PSS is parsed."
            href="/team/concepts"
          >
            <Field k="Product" v={prf.product_name} />
            <Field k="Approach" v={prf.development_approach} />
            <Field k="Form" v={prf.finished_form} />
            <Field k="Flavor type" v={prf.flavor_type} />
            <Field k="Intended application" v={prf.intended_application} />
          </ScopedReadCard>
        </TabsContent>

        <TabsContent value="ingredients">
          <ScopedReadCard title="Ingredients (from PSS)" href="/team/ingredients"
            empty="Ingredients appear here after PSS approval.">
            {(batchSheet?.data_json?.ingredients || []).slice(0, 50).map((ing: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-[hsl(var(--tp-hairline))] last:border-0">
                <span className="text-[hsl(var(--tp-text))]">{ing.name || ing.ingredient_name}</span>
                <span className="text-[hsl(var(--tp-text-dim))]">{ing.percentage ?? ing.percentage_formula ?? "—"}%</span>
              </div>
            ))}
          </ScopedReadCard>
        </TabsContent>

        <TabsContent value="formulas">
          <ScopedReadCard title="Formula" href="/team/formulas"
            empty="Formula will be drafted from the approved PSS.">
            <p className="text-sm text-[hsl(var(--tp-text-muted))]">
              Editing happens in the dedicated Formulas page. The batch sheet preview reflects the latest PSS.
            </p>
          </ScopedReadCard>
        </TabsContent>

        <TabsContent value="packaging">
          <ScopedReadCard title="Packaging" href="/team/packaging" empty="—">
            <Field k="Readiness" v={prf.packaging_readiness} />
            <Field k="Primary" v={prf.primary_packaging_vessel} />
            <Field k="Weight per unit" v={prf.weight_per_unit && `${prf.weight_per_unit} ${prf.weight_per_unit_unit || ""}`} />
            <Field k="Units / primary pack" v={prf.units_per_primary_pack} />
            <Field k="Secondary" v={prf.secondary_packaging} />
          </ScopedReadCard>
        </TabsContent>

        <TabsContent value="shelf-life">
          <ScopedReadCard title="Shelf Life" href="/team/shelf-life" empty="No shelf-life data yet.">
            <p className="text-sm text-[hsl(var(--tp-text-muted))]">No tests recorded on the team side yet.</p>
          </ScopedReadCard>
        </TabsContent>

        <TabsContent value="products">
          <ScopedReadCard title="Products" href="/team/products" empty="—">
            <Field k="Target date" v={prf.target_date} />
            <Field k="Annual volume" v={prf.annual_volume} />
            <Field k="Order frequency" v={prf.order_frequency} />
            <Field k="Price target/unit" v={prf.price_target_per_unit} />
          </ScopedReadCard>
        </TabsContent>

        <TabsContent value="costing">
          <ScopedReadCard title="Costing" href="/team/costing" empty="No costing yet." />
        </TabsContent>

        <TabsContent value="notes">
          <div className="tp-surface p-5">
            <p className="text-sm text-[hsl(var(--tp-text-muted))]">
              Project notes live in the parent client folder for now. Open the folder to edit.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <PrfReviewPanel prfId={openPrf ? (prfId as string) : null} onClose={() => setOpenPrf(false)} />

      {/* Batch sheet side panel — staff-only */}
      {batchOpen && batchSheet && (
        <div className="fixed inset-0 z-50 team-portal" onClick={() => setBatchOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div onClick={(e) => e.stopPropagation()}
               className="absolute right-0 top-0 h-full w-full max-w-[680px] tp-surface border-l border-[hsl(var(--tp-hairline))] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--tp-hairline))] bg-[hsl(var(--tp-surface))]/95 backdrop-blur">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-gold))]">Internal · Adventure Bakery only</p>
                <h2 className="font-display text-lg text-[hsl(var(--tp-text))]">Batch Sheet — {batchSheet.data_json?.product_name || prf.product_name}</h2>
              </div>
              <button onClick={() => setBatchOpen(false)} className="tp-btn">Close</button>
            </div>
            <div className="p-6 space-y-6">
              <section>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-2">Recipe</p>
                <div className="tp-surface p-4">
                  {(batchSheet.data_json?.ingredients || []).map((ing: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm py-1 border-b border-[hsl(var(--tp-hairline))] last:border-0">
                      <span>{ing.name || ing.ingredient_name}</span>
                      <span className="text-[hsl(var(--tp-text-dim))]">{ing.percentage ?? "—"}%</span>
                    </div>
                  ))}
                  {(batchSheet.data_json?.ingredients || []).length === 0 && (
                    <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No ingredients parsed.</p>
                  )}
                </div>
              </section>
              <section>
                <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))] mb-2">Process steps</p>
                <ol className="tp-surface p-4 space-y-2 list-decimal pl-6 text-sm">
                  {(batchSheet.data_json?.process_steps || []).map((s: string, i: number) => <li key={i}>{s}</li>)}
                  {(batchSheet.data_json?.process_steps || []).length === 0 && (
                    <p className="text-sm italic text-[hsl(var(--tp-text-dim))] list-none">No process steps parsed.</p>
                  )}
                </ol>
              </section>
              <p className="text-[10px] text-[hsl(var(--tp-text-dim))]">
                Generated {batchSheet.updated_at ? new Date(batchSheet.updated_at).toLocaleString() : "—"} from PSS.
                Re-runs overwrite this draft.
              </p>
            </div>
          </div>
        </div>
      )}
    </TeamPage>
  );
};

const Field = ({ k, v }: { k: string; v: any }) => {
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
    return (
      <div className="grid grid-cols-3 gap-3 py-2 border-b border-[hsl(var(--tp-hairline))] last:border-0">
        <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">{k}</p>
        <p className="col-span-2 text-sm italic text-[hsl(var(--tp-text-dim))]">—</p>
      </div>
    );
  }
  const display = Array.isArray(v) ? v.join(", ") : String(v);
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-[hsl(var(--tp-hairline))] last:border-0">
      <p className="text-[11px] uppercase tracking-wider text-[hsl(var(--tp-text-dim))]">{k}</p>
      <p className="col-span-2 text-sm text-[hsl(var(--tp-text))]">{display}</p>
    </div>
  );
};

const ScopedReadCard = ({
  title, href, empty, children,
}: { title: string; href: string; empty?: string; children?: React.ReactNode }) => (
  <div className="tp-surface p-5">
    <div className="flex items-center justify-between mb-4">
      <h3 className="font-display text-base text-[hsl(var(--tp-text))]">{title}</h3>
      <Link to={href} className="tp-btn text-[11px]">
        <ExternalLink className="w-3 h-3" /> Open editor
      </Link>
    </div>
    {children || (empty && <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">{empty}</p>)}
  </div>
);

export default SalesProjectWorkspace;
