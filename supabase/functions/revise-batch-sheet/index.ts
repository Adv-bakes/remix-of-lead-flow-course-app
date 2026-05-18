// Creates a new version of a batch sheet when staff edits it.
// Supersedes the current active row and inserts v+1 carrying forward all fields.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: any, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    const body = await req.json();
    const { batch_sheet_id, data_json, status, source_change } = body || {};
    if (!batch_sheet_id || !data_json) return json({ error: "batch_sheet_id and data_json required" }, 400);

    const { data: current, error: curErr } = await admin
      .from("batch_sheets")
      .select("*")
      .eq("id", batch_sheet_id)
      .maybeSingle();
    if (curErr || !current) return json({ error: "Batch sheet not found" }, 404);
    if (current.superseded_at) return json({ error: "This version is already superseded" }, 409);

    const nextVersion = (current.version || 1) + 1;

    // Supersede current
    const { error: supErr } = await admin
      .from("batch_sheets")
      .update({
        superseded_at: new Date().toISOString(),
        superseded_by_version: nextVersion,
      })
      .eq("id", current.id)
      .is("superseded_at", null);
    if (supErr) return json({ error: supErr.message }, 500);

    // Insert new version
    const { data: inserted, error: insErr } = await admin
      .from("batch_sheets")
      .insert({
        pss_document_id: current.pss_document_id,
        lead_id: current.lead_id,
        client_user_id: current.client_user_id,
        concept_id: current.concept_id,
        status: status || current.status || "draft",
        data_json,
        generated_from: current.generated_from || "pss",
        version: nextVersion,
        source_change: source_change || "staff_edit",
        last_edited_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    // Activity log
    const clientId = current.client_user_id;
    if (clientId) {
      await admin.from("client_activity").insert({
        client_id: clientId,
        actor_id: user.id,
        action: "batch_sheet_revised",
        payload: {
          batch_sheet_id: inserted.id,
          previous_id: current.id,
          from_version: current.version,
          to_version: nextVersion,
          source_change: source_change || "staff_edit",
        },
      });
    }

    // Reconcile blanks on the PSS side from this batch-sheet revision.
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/reconcile-pss-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({ batch_sheet_id: inserted.id }),
      });
    } catch (e) { console.warn("reconcile after revise failed:", e); }

    return json({ ok: true, batch_sheet: inserted });
  } catch (e) {
    console.error("revise-batch-sheet error:", e);
    return json({ error: (e as Error).message || "Unknown" }, 500);
  }
});
