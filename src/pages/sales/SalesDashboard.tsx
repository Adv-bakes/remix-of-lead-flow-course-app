import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage, KpiTile } from "@/components/team/TeamPage";
import { Search, Plus, Download, FileText, FileSignature, FileCheck2, ChevronDown } from "lucide-react";
import { AddDealDialog } from "@/components/sales/AddDealDialog";
import { fetchActiveTemplates, downloadTemplate, type ActiveTemplate, type TemplateKind } from "@/lib/templates";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const STAGES = ["Lead In", "Send Documents", "Follow-Up", "Quote", "Approved"] as const;
type Stage = (typeof STAGES)[number];

interface ProjectCard {
  id: string;                 // prf_submissions.id
  product_name: string | null;
  company_name: string | null;
  email: string | null;
  sales_stage: Stage;
  sales_stage_updated_at: string | null;
  lead_id: string | null;
  quote_approved_at: string | null;
}

const daysSince = (iso: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;

const SalesDashboard = () => {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [templates, setTemplates] = useState<Record<TemplateKind, ActiveTemplate | null> | null>(null);
  const [pendingByLead, setPendingByLead] = useState<Record<string, { nda: boolean; pss: boolean }>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("prf_submissions")
      .select("id, product_name, company_name, email, sales_stage, sales_stage_updated_at, lead_id, quote_approved_at")
      .order("sales_stage_updated_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data ?? []).map((p: any) => ({ ...p, sales_stage: (p.sales_stage as Stage) || "Lead In" })) as ProjectCard[];
    setProjects(rows);

    // Self-heal: link any PRF missing a lead_id to its matching sales_lead by email.
    const orphans = rows.filter(p => !p.lead_id && p.email);
    if (orphans.length) {
      const emails = Array.from(new Set(orphans.map(o => o.email!.toLowerCase())));
      const { data: leads } = await (supabase as any)
        .from("sales_leads")
        .select("id, email")
        .in("email", emails);
      const byEmail: Record<string, string> = {};
      (leads || []).forEach((l: any) => { if (l.email) byEmail[l.email.toLowerCase()] = l.id; });
      const patches = orphans
        .map(o => ({ id: o.id, lead_id: byEmail[o.email!.toLowerCase()] }))
        .filter(p => p.lead_id);
      if (patches.length) {
        await Promise.all(patches.map(p =>
          (supabase as any).from("prf_submissions").update({ lead_id: p.lead_id }).eq("id", p.id)
        ));
        setProjects(ps => ps.map(p => {
          const match = patches.find(x => x.id === p.id);
          return match ? { ...p, lead_id: match.lead_id } : p;
        }));
      }
    }

    const { count } = await supabase
      .from("prf_submissions")
      .select("*", { count: "exact", head: true })
      .in("status", ["new", "reviewing"]);
    setInboxCount(count || 0);

    // Build pending-doc map per lead (NDA or PSS not yet approved)
    const leadIds = Array.from(new Set(rows.map(r => r.lead_id).filter(Boolean) as string[]));
    if (leadIds.length) {
      const { data: leadsWithProfile } = await (supabase as any)
        .from("sales_leads")
        .select("id, profile_id")
        .in("id", leadIds);
      const profileToLead: Record<string, string> = {};
      (leadsWithProfile || []).forEach((l: any) => { if (l.profile_id) profileToLead[l.profile_id] = l.id; });
      const profileIds = Object.keys(profileToLead);
      if (profileIds.length) {
        const { data: docs } = await supabase
          .from("client_documents")
          .select("user_id, document_type, review_status")
          .in("user_id", profileIds)
          .in("review_status", ["pending", "ai_passed", "ai_flagged"]);
        const map: Record<string, { nda: boolean; pss: boolean }> = {};
        (docs || []).forEach((d: any) => {
          const lid = profileToLead[d.user_id];
          if (!lid) return;
          const t = (d.document_type || "").toLowerCase();
          if (!map[lid]) map[lid] = { nda: false, pss: false };
          if (t === "nda") map[lid].nda = true;
          if (t === "pss") map[lid].pss = true;
        });
        setPendingByLead(map);
      }
    }

    setLoading(false);
  };

  useEffect(() => { load(); fetchActiveTemplates().then(setTemplates); }, []);

  const moveProject = async (id: string, stage: Stage) => {
    const prev = projects;
    const patch: any = { sales_stage: stage, sales_stage_updated_at: new Date().toISOString() };
    if (stage === "Approved") patch.quote_approved_at = new Date().toISOString();
    setProjects(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p));
    const { error } = await (supabase as any).from("prf_submissions").update(patch).eq("id", id);
    if (error) { toast.error(error.message); setProjects(prev); }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return projects;
    return projects.filter(p =>
      [p.product_name, p.company_name, p.email].some(v => v && v.toLowerCase().includes(s))
    );
  }, [projects, q]);

  const open = projects.filter(p => p.sales_stage !== "Approved").length;
  const stuck = projects.filter(p => p.sales_stage !== "Approved" && daysSince(p.sales_stage_updated_at) >= 7).length;
  const approvedThisMonth = projects.filter(p => {
    if (!p.quote_approved_at) return false;
    const d = new Date(p.quote_approved_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  return (
    <TeamPage
      eyebrow="Sales"
      title="Dashboard"
      description="Presale project pipeline. Each card is one product (PRF). Approving sends it to the client's Products tab."
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--tp-text-dim))]" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search projects…"
              className="tp-input pl-9 w-[240px]"
            />
          </div>
          <button onClick={() => setAddOpen(true)} className="tp-btn tp-btn-primary">
            <Plus className="w-4 h-4" /> Add Deal
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiTile label="Open projects" value={open} />
        <KpiTile label="Stuck >7d" value={stuck} hint={stuck ? "Needs follow-up" : "All moving"} />
        <KpiTile label="Approved this month" value={approvedThisMonth} />
        <KpiTile label="PRFs to review" value={inboxCount} emphasis={inboxCount > 0} />
      </div>

      {/* Templates dropdown — download blank master files */}
      <div className="mb-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="tp-btn">
              <Download className="w-3.5 h-3.5" /> Download Templates <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-50 bg-[hsl(var(--tp-surface-3))] border border-[hsl(var(--tp-hairline-strong))] text-[hsl(var(--tp-text))] shadow-2xl">
            <DropdownMenuItem
              disabled={!templates?.prf_template}
              onClick={() => downloadTemplate(templates?.prf_template ?? null, "prf_template")}
            >
              <FileText className="w-3.5 h-3.5 mr-2" /> Blank PRF
              {!templates?.prf_template && <span className="ml-2 text-[10px] opacity-60">not uploaded</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!templates?.nda}
              onClick={() => downloadTemplate(templates?.nda ?? null, "nda")}
            >
              <FileSignature className="w-3.5 h-3.5 mr-2" /> NDA
              {!templates?.nda && <span className="ml-2 text-[10px] opacity-60">not uploaded</span>}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!templates?.pss_workbook}
              onClick={() => downloadTemplate(templates?.pss_workbook ?? null, "pss_workbook")}
            >
              <FileCheck2 className="w-3.5 h-3.5 mr-2" /> PSS workbook
              {!templates?.pss_workbook && <span className="ml-2 text-[10px] opacity-60">not uploaded</span>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading ? (
        <p className="text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {STAGES.map(stage => {
            const cards = filtered.filter(p => p.sales_stage === stage);
            return (
              <div
                key={stage}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragging) { moveProject(dragging, stage); setDragging(null); } }}
                className="tp-surface p-3 min-h-[300px]"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))]">{stage}</p>
                  <span className="text-[10px] text-[hsl(var(--tp-text-dim))]">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map(p => {
                    const pend = p.lead_id ? pendingByLead[p.lead_id] : null;
                    const pendChips: string[] = [];
                    if (pend?.pss) pendChips.push("PSS");
                    if (pend?.nda) pendChips.push("NDA");
                    const inner = (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-sm text-[hsl(var(--tp-text))] truncate">{p.product_name || "(unnamed)"}</p>
                          {pendChips.length > 0 && (
                            <span className="tp-chip text-[9px] uppercase tracking-wider text-[hsl(var(--tp-gold))] border-[hsl(var(--tp-gold))]/40 shrink-0">
                              {pendChips.join(" + ")} pending
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[hsl(var(--tp-text-dim))] truncate">{p.company_name || p.email}</p>
                        <p className="text-[10px] text-[hsl(var(--tp-text-dim))] mt-1">
                          {daysSince(p.sales_stage_updated_at)}d in stage
                          {!p.lead_id && <span className="ml-1 text-[hsl(var(--tp-gold))]">· accept in inbox</span>}
                        </p>
                      </>
                    );
                    return (
                      <div
                        key={p.id}
                        draggable
                        onDragStart={() => setDragging(p.id)}
                        onDragEnd={() => setDragging(null)}
                        className="tp-surface p-3 cursor-grab active:cursor-grabbing hover:opacity-90"
                      >
                        {p.lead_id ? (
                          <Link to={`/team/sales/clients/${p.lead_id}/projects/${p.id}`}>{inner}</Link>
                        ) : (
                          <div title="Accept this PRF in Documents Inbox to open the project workspace">{inner}</div>
                        )}
                      </div>
                    );
                  })}
                  {!cards.length && <p className="text-[11px] italic text-[hsl(var(--tp-text-dim))]">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <AddDealDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => load()} />
    </TeamPage>
  );
};

export default SalesDashboard;
