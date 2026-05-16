import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage, KpiTile } from "@/components/team/TeamPage";
import { Search, Plus } from "lucide-react";
import { AddDealDialog } from "@/components/sales/AddDealDialog";

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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("prf_submissions")
      .select("id, product_name, company_name, email, sales_stage, sales_stage_updated_at, lead_id, quote_approved_at")
      .order("sales_stage_updated_at", { ascending: false });
    if (error) toast.error(error.message);
    setProjects((data ?? []).map((p: any) => ({ ...p, sales_stage: (p.sales_stage as Stage) || "Lead In" })));

    const { count } = await supabase
      .from("prf_submissions")
      .select("*", { count: "exact", head: true })
      .in("status", ["new", "reviewing"]);
    setInboxCount(count || 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Open projects" value={open} />
        <KpiTile label="Stuck >7d" value={stuck} hint={stuck ? "Needs follow-up" : "All moving"} />
        <KpiTile label="Approved this month" value={approvedThisMonth} />
        <KpiTile label="PRFs to review" value={inboxCount} emphasis={inboxCount > 0} />
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
                    const inner = (
                      <>
                        <p className="font-display text-sm text-[hsl(var(--tp-text))] truncate">{p.product_name || "(unnamed)"}</p>
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
