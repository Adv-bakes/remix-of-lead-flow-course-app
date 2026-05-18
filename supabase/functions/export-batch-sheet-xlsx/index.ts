// Exports a Batch Sheet as .xlsx in the Replit costing-engine column layout.
// Columns: A # | B Ingredient | C %Formula | D Weight(g) | E Case Weight | F UoM
//          G Vendor 1 | H Vendor 1 Notes | I Vendor 2 | J Vendor 2 Notes | K Vendor 3 | L Vendor 3 Notes
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isStaff } = await admin.rpc("is_staff_or_admin", { _user_id: user.id });
    if (!isStaff) return json({ error: "Forbidden" }, 403);

    const { batch_sheet_id } = await req.json();
    if (!batch_sheet_id) return json({ error: "batch_sheet_id required" }, 400);

    const { data: sheet, error: sErr } = await admin
      .from("batch_sheets")
      .select("*")
      .eq("id", batch_sheet_id)
      .single();
    if (sErr || !sheet) return json({ error: sErr?.message || "Not found" }, 404);

    const d = sheet.data_json || {};
    const header = d.header || {};
    const product = d.product || {};
    const ings: any[] = d.recipe?.ingredients || [];
    const pkg = d.packaging || {};
    const process = d.process || {};
    const changedAt = sheet.updated_at ? new Date(sheet.updated_at).toLocaleString() : "—";

    const wb = XLSX.utils.book_new();

    // ----- Sheet 1: Batch Sheet (structured AB layout) -----
    const aoa: any[][] = [];
    aoa.push(["ADVENTURE BAKERY — BATCH SHEET", "", "", "", "", `Version: v${sheet.version}`]);
    aoa.push([`Last changed: ${changedAt}`, "", "", "", "", `Source: ${(sheet.source_change || "initial").replace(/_/g, " ")}`]);
    aoa.push([]);
    // Header block
    aoa.push(["HEADER"]);
    aoa.push(["Company", header.company_name || "", "", "Customer", header.customer_name || ""]);
    aoa.push(["Product Name", header.product_name || "", "", "Product Code", header.product_code || ""]);
    aoa.push(["Version #", header.version_number || "", "", "Revision #", header.revision_number || ""]);
    aoa.push(["Prepared By", header.prepared_by || "", "", "Approved By", header.approved_by || ""]);
    aoa.push(["Date of Issue", header.date_of_issue || "", "", "Status", sheet.status]);
    aoa.push([]);
    // Product block
    aoa.push(["PRODUCT"]);
    aoa.push(["Target Unit Weight (raw)", `${product.target_unit_weight_raw ?? ""} ${product.weight_unit ?? ""}`.trim()]);
    aoa.push(["Target Unit Weight (baked)", product.target_unit_weight_baked ?? ""]);
    aoa.push(["Expected Bake Loss %", product.expected_bake_loss_pct ?? ""]);
    aoa.push(["Shape", product.shape || ""]);
    aoa.push(["Intended Use", product.intended_use || ""]);
    aoa.push(["Target Shelf Life", product.target_shelf_life || ""]);
    aoa.push([]);
    // Recipe block
    aoa.push(["RECIPE", "", "", "", "", `Total Batch Weight: ${d.recipe?.total_batch_weight ?? ""} ${d.recipe?.weight_unit ?? ""}`]);
    aoa.push([
      "#", "Ingredient", "%Formula", "Weight (g)", "Case Weight", "UoM",
      "Vendor 1", "Vendor 2", "Vendor 3", "Vendor Notes",
    ]);
    ings.forEach((i, idx) => {
      aoa.push([
        idx + 1,
        i.name || "",
        i.percentage ?? "",
        i.weight_g ?? i.weight ?? "",
        i.case_weight ?? "",
        i.case_weight_uom ?? "",
        i.vendor_1 ?? "",
        i.vendor_2 ?? "",
        i.vendor_3 ?? "",
        i.vendor_notes ?? "",
      ]);
    });
    aoa.push([]);
    // Process block (proprietary)
    aoa.push(["PROCESS (proprietary)", "", "", "", "", `Method: ${process.method || "—"}`]);
    aoa.push(["#", "Action", "Ingredients Added", "Mix Time (min)", "Mix Speed"]);
    (process.pre_bake?.steps || []).forEach((s: any, idx: number) => {
      aoa.push([
        idx + 1,
        s.action || "",
        Array.isArray(s.ingredients_added) ? s.ingredients_added.join(", ") : "",
        s.mix_time_min ?? "",
        s.mix_speed ?? "",
      ]);
    });
    if (!process.is_no_bake && process.bake) {
      aoa.push([]);
      aoa.push(["Bake", `${process.bake.temperature ?? ""}${process.bake.temp_unit ?? ""} for ${process.bake.time_minutes ?? ""} min`]);
    }
    aoa.push([]);
    // Packaging block
    aoa.push(["PACKAGING"]);
    aoa.push(["Primary Vessel", pkg.primary?.vessel || ""]);
    aoa.push(["Units / Primary Pack", pkg.primary?.units_per_pack ?? ""]);
    aoa.push(["Net Weight / Primary Pack", `${pkg.primary?.net_weight_per_pack ?? ""} ${pkg.primary?.weight_unit ?? ""}`.trim()]);
    aoa.push(["Secondary Pack", pkg.secondary?.type || ""]);
    aoa.push(["Units / Case", pkg.secondary?.units_per_case ?? ""]);
    aoa.push(["Cases / Pallet", pkg.palletizing?.cases_per_pallet ?? ""]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [
      { wch: 6 }, { wch: 34 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
      { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Batch Sheet");

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as Uint8Array;

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const path = `${batch_sheet_id}/v${sheet.version}-${ts}.xlsx`;

    const { error: upErr } = await admin.storage.from("batch-sheets").upload(path, buf, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      upsert: true,
    });
    if (upErr) return json({ error: upErr.message }, 500);

    const { data: signed } = await admin.storage.from("batch-sheets").createSignedUrl(path, 3600);

    await admin.from("batch_sheets")
      .update({ xlsx_path: path, last_edited_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", batch_sheet_id);

    if (sheet.lead_id) {
      await admin.from("internal_notifications").insert({
        notification_type: "batch_sheet_exported",
        reference_id: batch_sheet_id,
        reference_table: "batch_sheets",
        title: `Batch sheet exported — ${header.product_name || header.company_name || ""}`,
        message: `v${sheet.version} exported to Excel.`,
      });
    }

    return json({ ok: true, path, signed_url: signed?.signedUrl || null });
  } catch (e) {
    console.error("export-batch-sheet-xlsx error:", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
