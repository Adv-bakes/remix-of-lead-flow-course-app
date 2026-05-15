import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MoneyOnly, useIsOwner } from "@/components/MoneyOnly";
import { TeamPage } from "@/components/team/TeamPage";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  business_name: string | null;
  email: string | null;
  phone: string | null;
  sales_stage: string | null;
  product_type: string | null;
  location: string | null;
  website: string | null;
  bio: string | null;
}

const SalesClientFolder = () => {
  const { id } = useParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [prfs, setPrfs] = useState<any[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [costing, setCosting] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { isOwner } = useIsOwner();

  useEffect(() => {
    if (!id) return;
    (async () => {
      const profRes = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
      const email = (profRes.data as any)?.email || "";
      const [d, pr, c, co, ac] = await Promise.all([
        supabase.from("client_documents").select("*").eq("user_id", id).order("uploaded_at", { ascending: false }),
        supabase.from("prf_submissions").select("*").or(`owner_user_id.eq.${id}${email ? `,email.eq.${email}` : ""}`).order("created_at", { ascending: false }),
        supabase.from("concepts").select("id, product_name, status, created_at").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("costing").select("*").eq("user_id", id).order("created_at", { ascending: false }),
        supabase.from("client_activity").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
      ]);
      if (profRes.error) toast.error(profRes.error.message);
      setProfile((profRes.data as any) || null);
      setDocs(d.data || []);
      setPrfs(pr.data || []);
      setConcepts(c.data || []);
      setCosting(co.data || []);
      setActivity(ac.data || []);
      setLoading(false);
    })();
  }, [id]);

  const logActivity = async (action: string, payload?: any) => {
    if (!id) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("client_activity").insert({ client_id: id, actor_id: user?.id, action, payload });
    const { data } = await supabase.from("client_activity").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50);
    setActivity(data || []);
    toast.success(action);
  };

  if (loading) return <p className="text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>;
  if (!profile) return <p className="text-sm text-[hsl(var(--tp-text-dim))]">Client not found.</p>;

  return (
    <div className="tp-fade-up">
      <Link to="/team/sales/clients" className="inline-flex items-center gap-1.5 text-xs mb-4 text-[hsl(var(--tp-text-dim))] hover:text-[hsl(var(--tp-gold-soft))]">
        <ArrowLeft className="w-3 h-3" /> Back to clients
      </Link>

      <TeamPage
        eyebrow="Client folder"
        title={profile.business_name || profile.full_name || "—"}
        description={[profile.email, profile.phone].filter(Boolean).join(" · ") || undefined}
        actions={<span className="tp-chip">{profile.sales_stage || "Lead In"}</span>}
      >
        <Tabs defaultValue="overview">
          <TabsList className="bg-transparent border-b border-[hsl(var(--tp-hairline))] rounded-none p-0 h-auto mb-6 gap-1">
            {[
              ["overview", "Overview"],
              ["documents", "Documents"],
              ["prfs", "PRFs"],
              ["concepts", "Concepts"],
              ...(isOwner ? [["quotes", "Quotes"]] : []),
              ["activity", "Activity"],
            ].map(([v, l]) => (
              <TabsTrigger
                key={v}
                value={v}
                className="rounded-none bg-transparent text-[hsl(var(--tp-text-muted))] data-[state=active]:bg-transparent data-[state=active]:text-[hsl(var(--tp-gold-soft))] data-[state=active]:border-b-2 data-[state=active]:border-[hsl(var(--tp-gold))] data-[state=active]:shadow-none px-4 pb-3 -mb-px"
              >
                {l}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <div className="tp-surface p-6">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-10 text-sm">
                {[
                  ["Contact", profile.full_name],
                  ["Company", profile.business_name],
                  ["Email", profile.email],
                  ["Phone", profile.phone],
                  ["Product type", profile.product_type],
                  ["Location", profile.location],
                  ["Website", profile.website],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--tp-text-dim))] mb-1">{k}</dt>
                    <dd className="text-[hsl(var(--tp-text))]">{(v as string) || "—"}</dd>
                  </div>
                ))}
              </dl>
              {profile.bio && (
                <div className="mt-6 pt-6 border-t border-[hsl(var(--tp-hairline))]">
                  <dt className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--tp-text-dim))] mb-2">Bio</dt>
                  <p className="text-sm text-[hsl(var(--tp-text))]">{profile.bio}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="documents">
            <div className="tp-surface p-6">
              {docs.length === 0 ? (
                <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No documents yet.</p>
              ) : (
                <ul className="divide-y divide-[hsl(var(--tp-hairline))]">
                  {docs.map((d) => (
                    <li key={d.id} className="py-3 flex justify-between text-sm text-[hsl(var(--tp-text))]">
                      <span>{d.file_name || d.document_type}</span>
                      <span className="text-[hsl(var(--tp-text-dim))]">{d.document_type}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 pt-5 border-t border-[hsl(var(--tp-hairline))] flex flex-wrap gap-2">
                <button className="tp-btn" onClick={() => logActivity("Sent NDA")}>Send NDA</button>
                <button className="tp-btn" onClick={() => logActivity("Sent PSS")}>Send PSS</button>
                <button className="tp-btn" onClick={() => logActivity("Uploaded document")}>Upload doc</button>
                <button className="tp-btn" onClick={() => logActivity("Invited to portal")}>Invite to portal</button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="prfs">
            <div className="tp-surface p-6">
              {prfs.length === 0 ? (
                <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No PRFs submitted yet.</p>
              ) : (
                <ul className="divide-y divide-[hsl(var(--tp-hairline))]">
                  {prfs.map((p) => (
                    <li key={p.id} className="py-3 flex justify-between text-sm text-[hsl(var(--tp-text))]">
                      <span>{p.product_name || p.project_type || "(untitled)"}</span>
                      <span className="text-[hsl(var(--tp-text-dim))]">{p.status} · {new Date(p.created_at).toLocaleDateString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          <TabsContent value="concepts">
            <div className="tp-surface p-6">
              {concepts.length === 0 ? (
                <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No concepts yet.</p>
              ) : (
                <ul className="divide-y divide-[hsl(var(--tp-hairline))]">
                  {concepts.map((c) => (
                    <li key={c.id} className="py-3 flex justify-between text-sm text-[hsl(var(--tp-text))]">
                      <span>{c.product_name || "(untitled concept)"}</span>
                      <span className="text-[hsl(var(--tp-text-dim))]">{c.status || "draft"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>

          {isOwner && (
            <TabsContent value="quotes">
              <MoneyOnly>
                <div className="tp-surface p-6">
                  {costing.length === 0 ? (
                    <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No quotes yet.</p>
                  ) : (
                    <ul className="divide-y divide-[hsl(var(--tp-hairline))]">
                      {costing.map((c) => (
                        <li key={c.id} className="py-3 flex justify-between text-sm text-[hsl(var(--tp-text))]">
                          <span>Target ${Number(c.target_price || 0).toFixed(2)}</span>
                          <span className="text-[hsl(var(--tp-text-dim))]">
                            Cost ${Number(c.total_cost || 0).toFixed(2)} · margin {c.margin_percentage ?? "—"}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </MoneyOnly>
            </TabsContent>
          )}

          <TabsContent value="activity">
            <div className="tp-surface p-6">
              {activity.length === 0 ? (
                <p className="text-sm italic text-[hsl(var(--tp-text-dim))]">No activity logged yet.</p>
              ) : (
                <ul className="space-y-2.5 text-sm">
                  {activity.map((a) => (
                    <li key={a.id} className="text-[hsl(var(--tp-text))]">
                      <span className="text-[hsl(var(--tp-text-dim))]">{new Date(a.created_at).toLocaleString()} · </span>
                      {a.action}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </TeamPage>
    </div>
  );
};

export default SalesClientFolder;
