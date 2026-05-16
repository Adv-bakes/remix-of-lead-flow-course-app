// Called when the prospect clicks Submit on the PSS wizard.
// Verifies token, generates a simple PDF summary, stores in product-spec-sheets,
// inserts client_documents row, emails the prospect + sales team, advances stage.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { id, token } = await req.json();
    if (!id || !token) return json({ error: "id and token required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row, error } = await admin
      .from("pss_submissions")
      .select("id, lead_id, profile_id, prospect_email, draft_token, status, data_json, product_label")
      .eq("id", id)
      .single();
    if (error || !row) return json({ error: "Submission not found" }, 404);
    if (row.draft_token !== token) return json({ error: "Invalid token" }, 403);
    if (row.status !== "submitted") return json({ error: "Not yet submitted" }, 400);

    // Fetch lead for sales contact info.
    const { data: lead } = await admin
      .from("sales_leads")
      .select("contact_name, company_name, email")
      .eq("id", row.lead_id)
      .single();

    // Render PDF summary.
    const pdfBytes = renderPdf(row, lead);
    const filePath = `${row.lead_id}/pss_${row.id}.pdf`;
    const fileName = `PSS_${(row.product_label || lead?.company_name || "submission").replace(/[^a-zA-Z0-9_-]+/g, "_")}.pdf`;

    const { error: upErr } = await admin.storage
      .from("product-spec-sheets")
      .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) console.warn("PSS PDF upload failed:", upErr.message);

    // Insert client_documents row. user_id is text in this table; use lead_id for keying.
    const ownerUserId = row.profile_id || row.lead_id;
    const documentId = crypto.randomUUID();
    await admin.from("client_documents").insert({
      id: documentId,
      user_id: ownerUserId,
      document_type: "pss",
      file_name: fileName,
      file_path: filePath,
      uploaded_at: new Date().toISOString(),
      uploaded_by: row.prospect_email,
      review_status: "auto_approved",
      review_notes: {
        source: "pss_wizard",
        pss_submission_id: row.id,
        extracted: row.data_json,
      },
    });

    // Email PDF copy to prospect + sales.
    if (RESEND_API_KEY) {
      const b64 = btoa(String.fromCharCode(...pdfBytes));
      const html = `<p>Hi ${(lead?.contact_name || "there").split(" ")[0]},</p>
<p>Thanks — we've received your Product Spec Sheet${row.product_label ? ` for <strong>${escapeHtml(row.product_label)}</strong>` : ""}. A copy is attached for your records. Our team will review and reach out with next steps.</p>
<p style="color:#888;font-size:12px;">— Adventure Bakery</p>`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Adventure Bakery <noreply@notify.adventurebakery.info>",
          to: [row.prospect_email],
          cc: ["scale@adventurebakery.info"],
          subject: `PSS received — ${row.product_label || lead?.company_name || "your product"}`,
          html,
          reply_to: "scale@adventurebakery.info",
          attachments: [{ filename: fileName, content: b64 }],
        }),
      });
    }

    // Advance lead stage to Follow-Up (only if currently in Send Documents).
    await admin
      .from("sales_leads")
      .update({ stage: "Follow-Up", stage_updated_at: new Date().toISOString() })
      .eq("id", row.lead_id)
      .eq("stage", "Send Documents");

    // Auto-generate batch sheet draft from this PSS (no sales review).
    try {
      const genUrl = `${SUPABASE_URL}/functions/v1/generate-batch-sheet-from-pss`;
      const r = await fetch(genUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": SERVICE_KEY,
        },
        body: JSON.stringify({ pss_document_id: documentId }),
      });
      if (!r.ok) {
        const txt = await r.text();
        console.warn("generate-batch-sheet-from-pss failed:", r.status, txt);
      }
    } catch (e) {
      console.warn("generate-batch-sheet-from-pss invoke error:", e);
    }

    return json({ success: true, documentId, filePath }, 200);
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderPdf(row: any, lead: any): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const data = row.data_json || {};
  let y = 56;
  const left = 56;
  const right = 540;

  const h1 = (t: string) => { doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(t, left, y); y += 22; };
  const h2 = (t: string) => { y += 6; doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text(t, left, y); y += 14; };
  const kv = (k: string, v: any) => {
    if (v === undefined || v === null || v === "") return;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const text = `${k}: ${String(v)}`;
    const lines = doc.splitTextToSize(text, right - left);
    for (const ln of lines) { ensure(); doc.text(ln, left, y); y += 13; }
  };
  const ensure = () => { if (y > 740) { doc.addPage(); y = 56; } };

  h1("Product Spec Sheet");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
  doc.text(`Submitted: ${new Date(row.submitted_at || Date.now()).toLocaleString()}`, left, y); y += 16;
  doc.setTextColor(0);

  h2("Header");
  kv("Company", data.header?.company_name || lead?.company_name);
  kv("Contact", data.header?.customer_name || lead?.contact_name);
  kv("Product name", data.header?.product_name || row.product_label);
  kv("Product code", data.header?.product_code);
  kv("Date of issue", data.header?.date_of_issue);

  h2("Product");
  kv("Target unit weight (raw)", joinUnit(data.product?.target_unit_weight_raw, data.product?.weight_unit));
  kv("Target unit weight (baked)", joinUnit(data.product?.target_unit_weight_baked, data.product?.weight_unit));
  kv("Expected bake loss %", data.product?.expected_bake_loss_pct);
  kv("Shape", data.product?.shape);
  kv("Intended use", data.product?.intended_use);
  kv("Target shelf life", data.product?.target_shelf_life);

  h2("Recipe");
  const recipe = data.recipe?.ingredients || [];
  kv("Total batch weight", joinUnit(data.recipe?.total_batch_weight, data.recipe?.weight_unit));
  kv("Ingredients", `${recipe.length} item${recipe.length === 1 ? "" : "s"}`);
  recipe.forEach((ing: any, i: number) => {
    ensure();
    doc.setFontSize(10);
    doc.text(`${i + 1}. ${ing.name || "(unnamed)"} — ${ing.weight ?? ""} ${ing.weight_unit ?? data.recipe?.weight_unit ?? ""}`, left + 12, y);
    y += 13;
  });

  h2("Process");
  kv("Method", data.process?.method);
  kv("Dough temp target", joinUnit(data.process?.pre_bake?.dough_temp_target, data.process?.pre_bake?.dough_temp_unit));
  kv("Bake temperature", joinUnit(data.process?.bake?.temperature, data.process?.bake?.temp_unit));
  kv("Bake time (min)", data.process?.bake?.time_minutes);
  kv("Post-bake freeze", data.process?.post_bake?.freeze_required ? "Yes" : "No");
  const steps = data.process?.pre_bake?.steps || [];
  if (steps.length) {
    kv("Steps", `${steps.length}`);
    steps.forEach((s: any, i: number) => {
      ensure();
      const ing = Array.isArray(s.ingredients_added) ? s.ingredients_added.join(", ") : "";
      const line = `${i + 1}. ${s.action || ""}${ing ? ` — adds: ${ing}` : ""}${s.mix_time_min ? ` (${s.mix_time_min} min)` : ""}`;
      const ls = doc.splitTextToSize(line, right - left - 12);
      for (const l of ls) { ensure(); doc.text(l, left + 12, y); y += 13; }
    });
  }

  h2("Packaging");
  kv("Primary vessel", data.packaging?.primary?.vessel);
  kv("Units per pack", data.packaging?.primary?.units_per_pack);
  kv("Net weight per pack", joinUnit(data.packaging?.primary?.net_weight_per_pack, data.packaging?.primary?.weight_unit));
  kv("Lot code on retail", data.packaging?.primary?.lot_code_printed ? "Yes" : "No");
  kv("Secondary type", data.packaging?.secondary?.type);
  kv("Units per case", data.packaging?.secondary?.units_per_case);
  kv("Lot code on case", data.packaging?.secondary?.lot_code_printed ? "Yes" : "No");
  kv("Cases per pallet", data.packaging?.palletizing?.cases_per_pallet);

  if (data.optional_sections?.nutritional_panel || data.optional_sections?.allergens || data.optional_sections?.shelf_life) {
    h2("Optional sections");
    kv("Nutritional panel", data.optional_sections?.nutritional_panel ? "Provided" : "—");
    kv("Allergens", data.optional_sections?.allergens ? "Provided" : "—");
    kv("Shelf life data", data.optional_sections?.shelf_life ? "Provided" : "—");
  }

  const out = doc.output("arraybuffer");
  return new Uint8Array(out);
}

function joinUnit(v: any, unit: any) {
  if (v === undefined || v === null || v === "") return undefined;
  return unit ? `${v} ${unit}` : `${v}`;
}
