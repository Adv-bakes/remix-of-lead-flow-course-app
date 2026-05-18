// Generates an internal Batch Sheet from an approved PSS.
// - Merges PSS extraction → PRF → concept → null (PSS wins).
// - Recipe is weight-first: percentage is recomputed from weights.
// - Recipe is locked on the batch sheet (UI must not allow weight edits).
// - Auto-creates a confidential (staff-only) formula if none exists for the concept.
// - Upserts on pss_document_id (re-running overwrites).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { activeProvider } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pick = <T,>(...vals: (T | null | undefined)[]): T | null => {
  for (const v of vals) if (v !== null && v !== undefined && v !== "") return v as T;
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const internalSecret = req.headers.get("x-internal-secret");
    const isInternal = !!internalSecret && internalSecret === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let callerId: string | null = null;
    if (!isInternal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

      const anon = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user: caller } } = await anon.auth.getUser();
      if (!caller) return json({ error: "Unauthorized" }, 401);
      const { data: isStaff } = await admin.rpc("is_staff_or_admin", { _user_id: caller.id });
      if (!isStaff) return json({ error: "Forbidden" }, 403);
      callerId = caller.id;
    }

    const { pss_document_id } = await req.json();
    if (!pss_document_id) return json({ error: "pss_document_id required" }, 400);

    const { data: pss } = await admin
      .from("client_documents")
      .select("*")
      .eq("id", pss_document_id)
      .maybeSingle();
    if (!pss) return json({ error: "PSS not found" }, 404);

    const clientUserId = pss.user_id && UUID_RE.test(pss.user_id) ? pss.user_id : null;

    // Lead lookup: profile_id, then email fallback
    let lead: any = null;
    if (clientUserId) {
      const r = await admin.from("sales_leads").select("id, profile_id, email, company_name, contact_name").eq("profile_id", clientUserId).maybeSingle();
      lead = r.data;
    }
    if (!lead && clientUserId) {
      const { data: prof } = await admin.from("profiles").select("email").eq("id", clientUserId).maybeSingle();
      if (prof?.email) {
        const r = await admin.from("sales_leads").select("id, profile_id, email, company_name, contact_name").eq("email", prof.email.toLowerCase()).maybeSingle();
        lead = r.data;
      }
    }

    // Most recent concept for this client (if any)
    let concept: any = null;
    if (clientUserId) {
      const r = await admin.from("concepts").select("*").eq("user_id", clientUserId).order("id", { ascending: false }).limit(1).maybeSingle();
      concept = r.data;
    }

    // Most recent PRF for this client (best-effort)
    let prf: any = null;
    if (clientUserId) {
      const r = await admin.from("prf_submissions").select("*").eq("owner_user_id", clientUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      prf = r.data;
    }

    const ex = (pss.review_notes && pss.review_notes.extracted) || {};
    const exHeader = ex.header || {};
    const exProduct = ex.product || {};
    const exRecipe = ex.recipe || {};
    const exProcess = ex.process || {};
    const exPack = ex.packaging || {};
    const exOpt = ex.optional_sections || {};

    // ---------- HEADER ----------
    const header = {
      company_name: pick(exHeader.company_name, lead?.company_name, concept?.customer_name),
      customer_name: pick(exHeader.customer_name, lead?.contact_name, concept?.customer_name),
      product_name: pick(exHeader.product_name, prf?.product_name, concept?.product_name),
      product_code: pick(exHeader.product_code, concept?.product_code),
      version_number: pick(exHeader.version_number, concept?.version_number),
      revision_number: pick(exHeader.revision_number, concept?.revision_number),
      prepared_by: pick(exHeader.prepared_by, concept?.prepared_by),
      approved_by: pick(exHeader.approved_by, concept?.approved_by),
      date_of_issue: pick(exHeader.date_of_issue, concept?.date_of_issue),
    };

    // ---------- PRODUCT ----------
    const product = {
      target_unit_weight_raw: pick(exProduct.target_unit_weight_raw, prf?.weight_per_unit ? Number(prf.weight_per_unit) : null, concept?.net_weight ? Number(concept.net_weight) : null),
      target_unit_weight_baked: exProduct.target_unit_weight_baked ?? null,
      weight_unit: pick(exProduct.weight_unit, prf?.weight_per_unit_unit, concept?.net_weight_unit),
      expected_bake_loss_pct: exProduct.expected_bake_loss_pct ?? null,
      unit_dimensions: {
        l: pick(exProduct?.unit_dimensions?.l, prf?.unit_dimension_l ? Number(prf.unit_dimension_l) : null, concept?.unit_length ? Number(concept.unit_length) : null),
        w: pick(exProduct?.unit_dimensions?.w, prf?.unit_dimension_w ? Number(prf.unit_dimension_w) : null, concept?.unit_width ? Number(concept.unit_width) : null),
        h: pick(exProduct?.unit_dimensions?.h, prf?.unit_dimension_h ? Number(prf.unit_dimension_h) : null, concept?.unit_height ? Number(concept.unit_height) : null),
        unit: pick(exProduct?.unit_dimensions?.unit, prf?.unit_dimension_unit),
      },
      shape: pick(exProduct.shape, concept?.shape),
      appearance: pick(exProduct.appearance, concept?.product_appearance),
      intended_use: pick(exProduct.intended_use, concept?.intended_use),
      target_shelf_life: pick(exProduct.target_shelf_life, concept?.target_shelf_life),
    };

    // forming-derived baked weight if loss + raw known
    if (product.target_unit_weight_raw && product.expected_bake_loss_pct != null && product.target_unit_weight_baked == null) {
      product.target_unit_weight_baked = round2(Number(product.target_unit_weight_raw) * (1 - Number(product.expected_bake_loss_pct) / 100));
    }

    // ---------- RECIPE (weight-first, locked) ----------
    const rawIngredients: any[] = Array.isArray(exRecipe.ingredients) ? exRecipe.ingredients : [];
    const recipeWarnings: string[] = [];
    let totalBatchWeight: number | null = exRecipe.total_batch_weight ?? null;
    const weightsKnown = rawIngredients.every((i) => typeof i.weight === "number" && i.weight > 0);
    if (totalBatchWeight == null && weightsKnown && rawIngredients.length > 0) {
      totalBatchWeight = rawIngredients.reduce((s, i) => s + Number(i.weight || 0), 0);
    } else if (totalBatchWeight != null && weightsKnown) {
      const sum = rawIngredients.reduce((s, i) => s + Number(i.weight || 0), 0);
      if (Math.abs(sum - totalBatchWeight) / totalBatchWeight > 0.01) {
        recipeWarnings.push(`Σ(weights)=${round2(sum)} ≠ declared total ${totalBatchWeight}`);
      }
    }

    // Pull existing sheet (so re-runs don't overwrite staff-entered vendor data)
    const { data: existingSheet } = await admin
      .from("batch_sheets")
      .select("data_json")
      .eq("pss_document_id", pss_document_id)
      .maybeSingle();
    const existingIngs: any[] = existingSheet?.data_json?.recipe?.ingredients || [];
    const existingByName = new Map<string, any>(
      existingIngs.map((e) => [String(e.name || "").toLowerCase().trim(), e]),
    );

    // Carry-forward vendor lookup: most recent prior batch sheet for this client
    const vendorByName = new Map<string, { v1?: string; v2?: string; v3?: string; notes?: string }>();
    if (clientUserId) {
      const { data: priorSheets } = await admin
        .from("batch_sheets")
        .select("data_json, updated_at")
        .eq("client_user_id", clientUserId)
        .neq("pss_document_id", pss_document_id)
        .order("updated_at", { ascending: false })
        .limit(20);
      for (const ps of priorSheets || []) {
        const ings: any[] = ps?.data_json?.recipe?.ingredients || [];
        for (const ing of ings) {
          const k = String(ing.name || "").toLowerCase().trim();
          if (!k || vendorByName.has(k)) continue;
          if (ing.vendor_1 || ing.vendor_2 || ing.vendor_3) {
            vendorByName.set(k, {
              v1: ing.vendor_1, v2: ing.vendor_2, v3: ing.vendor_3, notes: ing.vendor_notes,
            });
          }
        }
      }
    }

    const normalizedIngredients = rawIngredients.map((i) => {
      const weight = typeof i.weight === "number" ? i.weight : null;
      let percentage: number | null = null;
      if (weight != null && totalBatchWeight && totalBatchWeight > 0) {
        percentage = round2((weight / totalBatchWeight) * 100);
        if (typeof i.percentage === "number" && Math.abs(i.percentage - percentage) > 0.1) {
          recipeWarnings.push(`${i.name}: PSS % ${i.percentage} vs computed ${percentage}`);
        }
      } else if (typeof i.percentage === "number") {
        percentage = round2(i.percentage);
      }
      const key = String(i.name || "").toLowerCase().trim();
      const prev = existingByName.get(key);
      const carried = vendorByName.get(key);
      return {
        name: i.name,
        weight_g: weight,
        weight,
        weight_unit: i.weight_unit || exRecipe.weight_unit || null,
        percentage,
        category: i.category || null,
        notes: i.notes || null,
        // Editable, staff-managed columns (preserve existing > carry forward > blank)
        case_weight: prev?.case_weight ?? null,
        case_weight_uom: prev?.case_weight_uom ?? null,
        vendor_1: prev?.vendor_1 ?? carried?.v1 ?? null,
        vendor_2: prev?.vendor_2 ?? carried?.v2 ?? null,
        vendor_3: prev?.vendor_3 ?? carried?.v3 ?? null,
        vendor_notes: prev?.vendor_notes ?? carried?.notes ?? null,
        vendor_source: prev ? "staff" : (carried ? "prior_sheet" : null),
      };
    });

    if (normalizedIngredients.length > 0) {
      const sumPct = normalizedIngredients.reduce((s, i) => s + (i.percentage || 0), 0);
      if (Math.abs(sumPct - 100) > 0.05 && weightsKnown) {
        recipeWarnings.push(`Σ(%)=${round2(sumPct)} ≠ 100.00`);
      }
    }

    const recipe = {
      locked: true,
      total_batch_weight: totalBatchWeight,
      weight_unit: exRecipe.weight_unit || null,
      ingredients: normalizedIngredients,
      warnings: recipeWarnings,
    };

    // ---------- PROCESS ----------
    // Normalize steps: ingredients_added may arrive as comma-separated string from the wizard.
    const preBakeSteps: any[] = Array.isArray(exProcess?.pre_bake?.steps) ? exProcess.pre_bake.steps : [];
    const normalizedSteps = preBakeSteps.map((s: any, idx: number) => {
      let added: string[] = [];
      if (Array.isArray(s.ingredients_added)) added = s.ingredients_added.map(String);
      else if (typeof s.ingredients_added === "string" && s.ingredients_added.trim())
        added = s.ingredients_added.split(",").map((x: string) => x.trim()).filter(Boolean);
      return { ...s, step_number: idx + 1, ingredients_added: added };
    });

    const ingredientNames = new Set(normalizedIngredients.map((i) => (i.name || "").toLowerCase().trim()));
    const usedNames = new Set<string>();
    for (const step of normalizedSteps) {
      for (const n of step.ingredients_added) usedNames.add(String(n).toLowerCase().trim());
    }
    const missing = [...ingredientNames].filter((n) => n && !usedNames.has(n));
    const extra = [...usedNames].filter((n) => n && !ingredientNames.has(n));

    const methodStr = exProcess.method || null;
    const isNoBake = typeof methodStr === "string" && /^no-?bake/i.test(methodStr.trim());

    const process = {
      method: methodStr,
      is_no_bake: isNoBake,
      pre_bake: {
        steps: normalizedSteps,
        dough_temp_target: exProcess?.pre_bake?.dough_temp_target ?? null,
        dough_temp_unit: exProcess?.pre_bake?.dough_temp_unit ?? null,
      },
      forming: exProcess.forming || { machine: null, target_deposit_weight_raw: null, weight_unit: null, die_or_wire: null, notes: null },
      bake: isNoBake
        ? { time_minutes: null, temperature: null, temp_unit: null, expected_loss_pct: null, skipped: true }
        : exProcess.bake || { time_minutes: pick(concept?.baking_time_minutes ? Number(concept.baking_time_minutes) : null), temperature: pick(concept?.baking_temp ? Number(concept.baking_temp) : null), temp_unit: concept?.baking_temp_unit || null, expected_loss_pct: null },
      post_bake: exProcess.post_bake || { freeze_required: null, freeze_temp: null, freeze_time: null, notes: null },
      coverage_check: {
        all_recipe_ingredients_used: missing.length === 0 && ingredientNames.size > 0,
        missing,
        extra,
      },
    };

    // ---------- PACKAGING ----------
    const packaging = {
      primary: {
        vessel: pick(exPack?.primary?.vessel, prf?.primary_packaging_vessel),
        units_per_pack: pick(exPack?.primary?.units_per_pack, prf?.units_per_primary_pack ? Number(prf.units_per_primary_pack) : null),
        net_weight_per_pack: pick(exPack?.primary?.net_weight_per_pack, prf?.net_weight_per_primary_pack ? Number(prf.net_weight_per_primary_pack) : null),
        weight_unit: pick(exPack?.primary?.weight_unit, prf?.net_weight_per_primary_pack_unit),
        machine: exPack?.primary?.machine ?? null,
        lot_code_printed: exPack?.primary?.lot_code_printed ?? null,
      },
      secondary: {
        type: pick(exPack?.secondary?.type, prf?.secondary_packaging),
        units_per_case: pick(exPack?.secondary?.units_per_case, prf?.units_per_vessel ? Number(prf.units_per_vessel) : null),
        machine: exPack?.secondary?.machine ?? null,
        lot_code_printed: exPack?.secondary?.lot_code_printed ?? null,
      },
      palletizing: exPack?.palletizing || { cases_per_pallet: null, pattern: null, notes: null },
    };

    // ---------- SERVICES TO OFFER (Adventure Bakery proprietary services only) ----------
    // Allowed: Formula calculator, Packaging design & optimization, Nutritional panel,
    //          Allergen declaration & risk review, Shelf-life study & validation.
    // NEVER offer process development — process is proprietary to Adventure Bakery.
    const services: string[] = [];
    const recipeIncomplete = normalizedIngredients.length === 0
      || !totalBatchWeight
      || recipeWarnings.length > 0;
    if (recipeIncomplete) services.push("Formula calculator");
    if (!packaging.primary.vessel && !packaging.secondary.type) {
      services.push("Packaging design & optimization");
    }
    if (!exOpt.nutritional_panel) services.push("Nutritional panel development");
    if (!exOpt.allergens) services.push("Allergen declaration & risk review");
    if (!exOpt.shelf_life) services.push("Shelf-life study & validation");

    // ---------- FORMULA AUTO-CREATE (versioned) ----------
    let conceptId: number | null = concept?.id || null;
    let formulaId: string | null = null;
    if (normalizedIngredients.length > 0 && conceptId) {
      const { data: existing } = await admin
        .from("formulas")
        .select("id, version")
        .eq("concept_id", conceptId)
        .is("superseded_at", null)
        .limit(1);
      const rows = normalizedIngredients.map((i) => ({
        concept_id: conceptId,
        user_id: clientUserId,
        ingredient_name: i.name,
        ingredient_category: i.category,
        weight_g: i.weight,
        percentage: i.percentage || 0,
        percentage_formula: i.percentage,
        notes: i.notes,
        version: ((existing?.[0]?.version as number) || 0) + (existing && existing.length > 0 ? 1 : 0) || 1,
      }));
      if (existing && existing.length > 0) {
        // Supersede current active rows, insert new version
        const nextVersion = ((existing[0].version as number) || 1) + 1;
        rows.forEach((r) => (r.version = nextVersion));
        await admin
          .from("formulas")
          .update({ superseded_at: new Date().toISOString(), superseded_by_version: nextVersion })
          .eq("concept_id", conceptId)
          .is("superseded_at", null);
      }
      const { data: inserted } = await admin.from("formulas").insert(rows).select("id").limit(1);
      formulaId = inserted?.[0]?.id || null;
    }

    // ---------- PROPRIETARY PROCESSES (staff-only, seed once per concept) ----------
    if (conceptId && normalizedSteps.length > 0) {
      const { data: existingProc } = await admin
        .from("processes")
        .select("id")
        .eq("concept_id", conceptId)
        .is("superseded_at", null)
        .limit(1);
      if (!existingProc || existingProc.length === 0) {
        await admin.from("processes").insert(
          normalizedSteps.map((s: any) => ({
            concept_id: conceptId,
            step_number: s.step_number,
            action: s.action || null,
            ingredients_added: s.ingredients_added || [],
            mix_time_min: s.mix_time_min ? Number(s.mix_time_min) : null,
            mix_speed: s.mix_speed || null,
            temperature: !isNoBake && process.bake?.temperature ? Number(process.bake.temperature) : null,
            temp_unit: !isNoBake ? (process.bake?.temp_unit || null) : null,
            created_by: callerId,
          })),
        );
      }
    }

    const dataJson = {
      header,
      product,
      recipe,
      process,
      packaging,
      optional_sections: {
        nutritional_panel: exOpt.nutritional_panel ?? null,
        allergens: exOpt.allergens ?? null,
        shelf_life: exOpt.shelf_life ?? null,
      },
      services_to_offer: services,
      source: {
        pss_document_id,
        prf_id: prf?.id || null,
        concept_id: conceptId,
        formula_id: formulaId,
        generated_at: new Date().toISOString(),
        ...activeProvider(),
      },
    };

    // Versioning: if an active sheet exists for this PSS, supersede it and insert v+1.
    const { data: activeExisting } = await admin
      .from("batch_sheets")
      .select("id, version, status")
      .eq("pss_document_id", pss_document_id)
      .is("superseded_at", null)
      .maybeSingle();

    const nextVersion = (activeExisting?.version || 0) + 1;
    const sourceChange = activeExisting ? "pss_change" : "initial";

    if (activeExisting) {
      await admin
        .from("batch_sheets")
        .update({
          superseded_at: new Date().toISOString(),
          superseded_by_version: nextVersion,
        })
        .eq("id", activeExisting.id);
    }

    const { data: upserted, error: upsertErr } = await admin
      .from("batch_sheets")
      .insert({
        pss_document_id,
        lead_id: lead?.id || null,
        client_user_id: clientUserId,
        concept_id: conceptId,
        status: activeExisting?.status === "approved" ? "draft" : (activeExisting?.status || "draft"),
        data_json: dataJson,
        generated_from: "pss",
        version: nextVersion,
        source_change: sourceChange,
        last_edited_by: callerId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    if (lead?.profile_id) {
      await admin.from("client_activity").insert({
        client_id: lead.profile_id,
        actor_id: callerId,
        action: activeExisting ? "batch_sheet_regenerated_from_pss" : "batch_sheet_created",
        payload: {
          pss_document_id,
          batch_sheet_id: upserted.id,
          version: nextVersion,
          previous_version: activeExisting?.version || null,
          formula_id: formulaId,
          recipe_warnings: recipeWarnings,
          services_offered: services,
        },
      });
    }

    // Notify staff
    await admin.from("internal_notifications").insert({
      notification_type: "batch_sheet_drafted",
      reference_id: upserted.id,
      reference_table: "batch_sheets",
      title: `Batch sheet drafted — ${header.product_name || header.company_name || "new PSS"}`,
      message: `Auto-generated from PSS submission. ${services.length} services flagged.`,
    });

    // Reconcile so PSS values populate the freshly generated batch sheet rows.
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/reconcile-pss-batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        },
        body: JSON.stringify({ pss_document_id, batch_sheet_id: upserted.id }),
      });
    } catch (e) { console.warn("reconcile after generate failed:", e); }

    return json({ ok: true, batch_sheet: upserted, recipe_warnings: recipeWarnings, services_to_offer: services });
  } catch (e) {
    console.error("generate-batch-sheet-from-pss error:", e);
    return json({ error: (e as Error).message || "Unknown error" }, 500);
  }
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
