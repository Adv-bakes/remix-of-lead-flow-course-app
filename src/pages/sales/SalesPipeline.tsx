import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage, KpiTile } from "@/components/team/TeamPage";
import { PipelineCard, PipelineCardData } from "@/components/sales/PipelineCard";
import { PipelineColumn } from "@/components/sales/PipelineColumn";
import { Search } from "lucide-react";

const STAGES = ["Lead In", "Send Documents", "Follow-Up", "Quote", "First Order"] as const;
type Stage = (typeof STAGES)[number];

const daysSince = (iso: string | null) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
};

const SalesPipeline = () => {
  const [clients, setClients] = useState<PipelineCardData[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data: leads, error } = await (supabase as any)
      .from("sales_leads")
      .select("id, email, contact_name, company_name, stage, stage_updated_at, profile_id")
      .neq("stage", "Archived")
      .order("stage_updated_at", { ascending: false });
    if (error) toast.error(error.message);

    const emails = (leads || []).map((l: any) => l.email.toLowerCase());
    const profileIds = (leads || []).map((l: any) => l.profile_id).filter(Boolean);

    let prfMap: Record<string, boolean> = {};
    let docMap: Record<string, { nda: boolean; pss: boolean }> = {};

    if (emails.length) {
      const { data: prfs } = await supabase
        .from("prf_submissions")
        .select("email")
        .in("email", emails);
      (prfs || []).forEach((p: any) => { if (p.email) prfMap[p.email.toLowerCase()] = true; });
    }
    if (profileIds.length) {
      const { data: docs } = await supabase
        .from("client_documents")
        .select("user_id, document_type")
        .in("user_id", profileIds as any);
      (docs || []).forEach((d: any) => {
        const m = (docMap[d.user_id] ||= { nda: false, pss: false });
        const t = (d.document_type || "").toLowerCase();
        if (t.includes("nda")) m.nda = true;
        if (t.includes("pss") || t.includes("spec")) m.pss = true;
      });
    }

    setClients(((leads as any[]) || []).map((l) => ({
      id: l.id,
      email: l.email,
      contact_name: l.contact_name,
      company_name: l.company_name,
      stage: l.stage,
      stage_updated_at: l.stage_updated_at,
      has_prf: prfMap[l.email.toLowerCase()] || false,
      has_nda: l.profile_id ? docMap[l.profile_id]?.nda || false : false,
      has_pss: l.profile_id ? docMap[l.profile_id]?.pss || false : false,
    })));

    const { count } = await supabase
      .from("prf_submissions")
      .select("*", { count: "exact", head: true })
      .in("status", ["new", "reviewing"]);
    setInboxCount(count || 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const moveClient = async (id: string, stage: Stage) => {
    const prev = clients;
    setClients((c) => c.map((x) => x.id === id ? { ...x, stage, stage_updated_at: new Date().toISOString() } : x));
    const { error } = await (supabase as any)
      .from("sales_leads")
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error(error.message); setClients(prev); }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clients;
    return clients.filter((c) =>
      [c.company_name, c.contact_name, c.email].some((v) => v && v.toLowerCase().includes(s))
    );
  }, [clients, q]);

  const open = clients.length;
  const stuck = clients.filter((c) => daysSince(c.stage_updated_at) >= 7).length;
  const awaitingDocs = clients.filter((c) => c.stage === "Send Documents").length;

  return (
    <TeamPage
      eyebrow="Sales"
      title="Pipeline"
      description="Drag clients between stages. New PRFs land as cards automatically."
      actions={
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(var(--tp-text-dim))]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
            className="tp-input pl-9 w-[240px]"
          />
        </div>
      }
    >
      {/* KPI strip — no dollar guesses */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiTile label="Open deals" value={open} />
        <KpiTile label="Stuck >7d" value={stuck} hint={stuck ? "Needs follow-up" : "All moving"} />
        <KpiTile label="Awaiting docs" value={awaitingDocs} hint="In Send Documents" />
        <KpiTile label="PRFs to review" value={inboxCount} emphasis={inboxCount > 0} />
      </div>

      {/* Stage chip strip */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {STAGES.map((s) => {
          const n = filtered.filter((c) => (c.stage || "Lead In") === s).length;
          return (
            <span key={s} className="tp-chip tp-chip-muted text-[11px]">
              <span className="text-[hsl(var(--tp-text))]">{s}</span>
              <span className="ml-2 text-[hsl(var(--tp-text-dim))]">{n}</span>
            </span>
          );
        })}
      </div>

      {/* Kanban */}
      {loading ? (
        <p className="text-sm text-[hsl(var(--tp-text-dim))]">Loading pipeline…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          {STAGES.map((stage) => {
            const cards = filtered.filter((c) => (c.stage || "Lead In") === stage);
            return (
              <PipelineColumn
                key={stage}
                title={stage}
                count={cards.length}
                onDrop={(id) => { moveClient(id, stage); setDraggingId(null); }}
              >
                {cards.map((c) => (
                  <PipelineCard
                    key={c.id}
                    client={c}
                    isDragging={draggingId === c.id}
                    onDragStart={setDraggingId}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
              </PipelineColumn>
            );
          })}
        </div>
      )}
    </TeamPage>
  );
};

export default SalesPipeline;
