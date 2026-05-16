import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TeamPage } from "@/components/team/TeamPage";
import { FileText, Upload, Download } from "lucide-react";

type Kind = "nda" | "pss_workbook";

interface Template {
  id: string;
  kind: Kind;
  version: number;
  file_path: string;
  file_name: string;
  is_active: boolean;
  uploaded_at: string;
}

const KIND_META: Record<Kind, { title: string; desc: string; accept: string }> = {
  nda: {
    title: "Pre-signed NDA",
    desc: "PDF master sent as an attachment when sales accepts a PRF. Prospect countersigns and uploads back.",
    accept: "application/pdf",
  },
  pss_workbook: {
    title: "PSS Workbook (offline)",
    desc: "Excel workbook offered as a download link for clients who prefer to fill the PSS offline.",
    accept:
      ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

const TemplatesPage = () => {
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<Kind | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("document_templates")
      .select("*")
      .order("uploaded_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data || []) as Template[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleUpload = async (kind: Kind, file: File) => {
    setUploading(kind);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");

      const ext = file.name.split(".").pop() || "bin";
      const path = `${kind}/v${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("document-templates")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      // Deactivate previous active.
      await (supabase as any)
        .from("document_templates")
        .update({ is_active: false })
        .eq("kind", kind)
        .eq("is_active", true);

      // Compute next version.
      const next = (rows.filter((r) => r.kind === kind).reduce((m, r) => Math.max(m, r.version), 0)) + 1;

      const { error: insErr } = await (supabase as any).from("document_templates").insert({
        kind,
        version: next,
        file_path: path,
        file_name: file.name,
        is_active: true,
        uploaded_by: u.user.id,
      });
      if (insErr) throw insErr;
      toast.success(`Uploaded ${KIND_META[kind].title} v${next}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const download = async (path: string, name: string) => {
    const { data, error } = await supabase.storage
      .from("document-templates")
      .createSignedUrl(path, 300);
    if (error || !data?.signedUrl) return toast.error(error?.message || "No URL");
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  };

  return (
    <TeamPage
      eyebrow="Sales"
      title="Templates"
      description="Master files emailed to prospects. Uploading a new version automatically replaces the active one — the previous version is kept for history."
    >
      {(Object.keys(KIND_META) as Kind[]).map((kind) => {
        const meta = KIND_META[kind];
        const items = rows.filter((r) => r.kind === kind);
        const active = items.find((r) => r.is_active);
        return (
          <div key={kind} className="tp-surface p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="w-4 h-4 text-[hsl(var(--tp-gold))]" />
                  <h2 className="font-display text-base font-semibold text-[hsl(var(--tp-text))]">{meta.title}</h2>
                </div>
                <p className="text-xs text-[hsl(var(--tp-text-muted))] max-w-xl">{meta.desc}</p>
              </div>
              <label className="tp-btn tp-btn-primary cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                {uploading === kind ? "Uploading…" : active ? "Upload new version" : "Upload"}
                <input
                  type="file"
                  className="hidden"
                  accept={meta.accept}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(kind, f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {loading ? (
              <p className="text-sm text-[hsl(var(--tp-text-dim))]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-[hsl(var(--tp-text-dim))] italic">No template uploaded yet.</p>
            ) : (
              <div className="divide-y divide-[hsl(var(--tp-hairline))]">
                {items.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-[hsl(var(--tp-text))] truncate">
                        <span className="tp-chip text-[10px] uppercase tracking-wider mr-2">v{r.version}</span>
                        {r.is_active && (
                          <span className="tp-chip text-[10px] uppercase tracking-wider text-[hsl(var(--tp-gold))] mr-2">Active</span>
                        )}
                        {r.file_name}
                      </p>
                      <p className="text-[11px] text-[hsl(var(--tp-text-dim))] mt-0.5">
                        Uploaded {new Date(r.uploaded_at).toLocaleString()}
                      </p>
                    </div>
                    <button onClick={() => download(r.file_path, r.file_name)} className="tp-btn">
                      <Download className="w-3.5 h-3.5" /> Download
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </TeamPage>
  );
};

export default TemplatesPage;
