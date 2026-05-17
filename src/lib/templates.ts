import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TemplateKind = "nda" | "pss_workbook" | "prf_template";

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  nda: "NDA",
  pss_workbook: "PSS workbook",
  prf_template: "PRF template",
};

export interface ActiveTemplate {
  id: string;
  kind: TemplateKind;
  file_path: string;
  file_name: string;
  version: number;
}

export const fetchActiveTemplates = async (): Promise<Record<TemplateKind, ActiveTemplate | null>> => {
  const out: Record<TemplateKind, ActiveTemplate | null> = {
    nda: null,
    pss_workbook: null,
    prf_template: null,
  };
  const { data } = await (supabase as any)
    .from("document_templates")
    .select("id, kind, file_path, file_name, version, is_active")
    .eq("is_active", true);
  (data || []).forEach((r: any) => {
    if (r.kind in out) out[r.kind as TemplateKind] = r;
  });
  return out;
};

export const downloadTemplate = async (tpl: ActiveTemplate | null, kind: TemplateKind) => {
  if (!tpl) {
    toast.error(`No ${TEMPLATE_LABELS[kind]} template uploaded yet`);
    return;
  }
  const { data, error } = await supabase.storage
    .from("document-templates")
    .createSignedUrl(tpl.file_path, 600);
  if (error || !data?.signedUrl) {
    toast.error(error?.message || "Could not get template URL");
    return;
  }
  try {
    const res = await fetch(data.signedUrl);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = tpl.file_name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (e: any) {
    toast.error(e?.message || "Download failed");
  }
};
