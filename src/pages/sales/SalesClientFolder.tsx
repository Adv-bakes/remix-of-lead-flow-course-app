import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamPage } from "@/components/team/TeamPage";
import { PrfReviewPanel } from "@/components/sales/PrfReviewPanel";
import { toast } from "sonner";
import { ArrowLeft, Mail, Phone, Eye } from "lucide-react";

interface Lead {
  id: string;
  email: string;
  contact_name: string | null;
  company_name: string | null;
  phone: string | null;
  stage: string | null;
  stage_updated_at: string | null;
  profile_id: string | null;
  notes: string | null;
}

const STAGES = ["Lead In", "Send Documents", "Follow-Up", "Quote", "First Order"];

const SalesClientFolder = () => {
  const { id } = useParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [prfs, setPrfs] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPrf, setOpenPrf] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: l } = await (supabase as any)
      .from("sales_leads")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    setLead(l);
    setNotesDraft(l?.notes || "");

    if (l?.email) {
      const { data: p } = await supabase
        .from("prf_submissions")
        .select("id, product_name, project_type, status, created_at")
        .eq("email", l.email)
        .order("created_at", { ascending: false });
      setPrfs(p || []);
    }
    if (l?.profile_id) {
      const [d, a] = await Promise.all([
        supabase.from("client_documents").select("*").eq("user_id", l.profile_id).order("uploaded_at", { ascending: false }),
        supabase.from("client_activity").select("*").eq("client_id", l.profile_id).order("created_at", { ascending: false }).limit(50),
      ]);
      setDocs(d.data || []);
      setActivity(a.data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const setStage = async (stage: string) => {
    if (!lead) return;
    const { error } = await (supabase as any)
      .from("sales_leads")
      .update({ stage, stage_updated_at: new Date().toISOString() })
      .eq("id", lead.id);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${stage}`);
    setLead({ ...lead, stage, stage_updated_at: new Date().toISOString() });
  };

  const saveNotes = async () => {
    if (!lead) return;
    setSavingNotes(true);
    const { error } = await (supabase as any)
      .from("sales_leads")
      .update({ notes: notesDraft })
      .eq("id", lead.id);
    setSavingNotes(false);
    if (error) return toast.error(error.message);
    toast.success("Notes saved");
  };

  if (loading) return <TeamPage title="Loading…">…</TeamPage>;
  if (!lead) return (
    <TeamPage title="Not found">
      <Link to="/team/sales/clients" className="tp-btn"><ArrowLeft className="w-4 h-4" /> Back to clients</Link>
    </TeamPage>
  );

  const currentIdx = STAGES.indexOf(lead.stage || "Lead In");

  return (
    <TeamPage
      eyebrow="Client folder"
      title={lead.company_name || lead.contact_name || lead.email}
      description={[lead.contact_name, lead.email, lead.phone].filter(Boolean).join(" · ")}
      actions={
        <Link to="/team/sales/clients" className="tp-btn"><ArrowLeft className="w-4 h-4" /> Back</Link>
      }
    >
      {/* Stage stepper */}
      <div className="tp-surface p-4 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {STAGES.map((s, i) => {
            const active = i === currentIdx;
            const done = i < currentIdx;
            return (
              <button
                key={s}
                onClick={() => setStage(s)}
                className={`tp-chip text-[11px] cursor-pointer transition ${
                  active ? "bg-[hsl(var(--tp-gold))] text-black border-[hsl(var(--tp-gold))]"
                    : done ? "text-[hsl(var(--tp-text))]" : "text-[hsl(var(--tp-text-dim))]"
                }`}
              >
                {i + 1}. {s}
              </button>
            );
          })}
          {lead.stage === "Archived" && (
            <span className="tp-chip text-[11px] text-[hsl(var(--tp-warning))]">Archived</span>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="tp-surface mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="prfs">PRFs ({prfs.length})</TabsTrigger>
          <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="tp-surface p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))] mb-3">Contact</p>
              <p className="font-display text-lg text-[hsl(var(--tp-text))]">{lead.contact_name || "—"}</p>
              <p className="text-sm text-[hsl(var(--tp-text-muted))] mt-1 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> {lead.email}
              </p>
              {lead.phone && (
                <p className="text-sm text-[hsl(var(--tp-text-muted))] mt-1 flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" /> {lead.phone}
                </p>
              )}
            </div>
            <div className="tp-surface p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--tp-text-dim))] mb-3">Latest project</p>
              {prfs[0] ? (
                <>
                  <p className="font-display text-lg text-[hsl(var(--tp-text))]">{prfs[0].product_name || "—"}</p>
                  <p className="text-sm text-[hsl(var(--tp-text-muted))] mt-1">{prfs[0].project_type || "—"}</p>
                  <p className="text-[11px] text-[hsl(var(--tp-text-dim))] mt-2">
                    Submitted {new Date(prfs[0].created_at).toLocaleDateString()} · {prfs[0].status}
                  </p>
                </>
              ) : (
                <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No PRFs yet.</p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="prfs">
          <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))]">
            {prfs.length === 0 && <p className="p-8 text-sm text-[hsl(var(--tp-text-dim))] italic">No PRFs yet.</p>}
            {prfs.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-sm font-semibold text-[hsl(var(--tp-text))]">{p.product_name || "(unnamed)"}</p>
                  <p className="text-[11px] text-[hsl(var(--tp-text-dim))]">
                    {p.project_type || "—"} · {p.status} · {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setOpenPrf(p.id)} className="tp-btn">
                  <Eye className="w-3.5 h-3.5" /> Open
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))]">
            {docs.length === 0 && <p className="p-8 text-sm text-[hsl(var(--tp-text-dim))] italic">No documents uploaded.</p>}
            {docs.map((d) => (
              <div key={d.id} className="p-4">
                <p className="font-display text-sm text-[hsl(var(--tp-text))]">{d.file_name || d.document_type}</p>
                <p className="text-[11px] text-[hsl(var(--tp-text-dim))]">
                  {d.document_type} · {d.uploaded_at ? new Date(d.uploaded_at).toLocaleDateString() : ""}
                </p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))]">
            {activity.length === 0 && <p className="p-8 text-sm text-[hsl(var(--tp-text-dim))] italic">No activity logged.</p>}
            {activity.map((a) => (
              <div key={a.id} className="p-4">
                <p className="font-display text-sm text-[hsl(var(--tp-text))]">{a.action}</p>
                <p className="text-[11px] text-[hsl(var(--tp-text-dim))]">{new Date(a.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <div className="tp-surface p-5">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={10}
              placeholder="Salesperson notes — calls, follow-ups, context…"
              className="tp-input w-full resize-none"
            />
            <button onClick={saveNotes} disabled={savingNotes} className="tp-btn tp-btn-primary mt-3 disabled:opacity-50">
              {savingNotes ? "Saving…" : "Save notes"}
            </button>
          </div>
        </TabsContent>
      </Tabs>

      <PrfReviewPanel prfId={openPrf} onClose={() => setOpenPrf(null)} />
    </TeamPage>
  );
};

export default SalesClientFolder;
