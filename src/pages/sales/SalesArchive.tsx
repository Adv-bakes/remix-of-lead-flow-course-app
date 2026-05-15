import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage } from "@/components/team/TeamPage";
import { ArchiveRestore } from "lucide-react";

interface Lead {
  id: string;
  email: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  archived_at: string | null;
  archived_reason: string | null;
}

const SalesArchive = () => {
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("sales_leads")
      .select("id, email, company_name, contact_name, phone, archived_at, archived_reason")
      .eq("stage", "Archived")
      .order("archived_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const restore = async (id: string) => {
    const { error } = await (supabase as any)
      .from("sales_leads")
      .update({
        stage: "Lead In",
        stage_updated_at: new Date().toISOString(),
        archived_at: null,
        archived_reason: null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Restored to Lead In");
    setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <TeamPage
      eyebrow="Sales"
      title="Archive"
      description="Rejected leads. Contact data is kept; restore at any time."
    >
      <div className="tp-surface divide-y divide-[hsl(var(--tp-hairline))]">
        {loading && <p className="p-8 text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="p-10 text-center text-sm text-[hsl(var(--tp-text-dim))] italic">
            Empty. No archived leads.
          </p>
        )}
        {rows.map((r) => (
          <div key={r.id} className="p-5 flex items-start justify-between gap-4 hover:bg-white/[0.02] transition">
            <div className="min-w-0 flex-1">
              <Link to={`/team/sales/clients/${r.id}`} className="block">
                <p className="font-display text-sm font-semibold text-[hsl(var(--tp-text))] truncate">
                  {r.company_name || r.contact_name || r.email}
                </p>
              </Link>
              <p className="text-xs text-[hsl(var(--tp-text-muted))]">
                {[r.contact_name, r.email, r.phone].filter(Boolean).join(" · ")}
              </p>
              {r.archived_reason && (
                <p className="text-[11px] mt-2 text-[hsl(var(--tp-text-dim))] italic line-clamp-2">
                  "{r.archived_reason}"
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 text-right">
              <p className="text-[11px] text-[hsl(var(--tp-text-dim))]">
                {r.archived_at ? new Date(r.archived_at).toLocaleDateString() : "—"}
              </p>
              <button onClick={() => restore(r.id)} className="tp-btn">
                <ArchiveRestore className="w-3.5 h-3.5" /> Restore
              </button>
            </div>
          </div>
        ))}
      </div>
    </TeamPage>
  );
};

export default SalesArchive;
