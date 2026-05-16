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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user: caller } } = await anon.auth.getUser();
    if (!caller) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: isStaff } = await admin.rpc("is_staff_or_admin", { _user_id: caller.id });
    if (!isStaff) return json({ error: "Forbidden" }, 403);

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
      return {
        name: i.name,
        weight,
        weight_unit: i.weight_unit || exRecipe.weight_unit || null,
        percentage,
        category: i.category || null,
        notes: i.notes || null,
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
    const preBakeSteps = Array.isArray(exProcess?.pre_bake?.steps) ? exProcess.pre_bake.steps : [];
    const ingredientNames = new Set(normalizedIngredients.map((i) => (i.name || "").toLowerCase().trim()));
    const usedNames = new Set<string>();
    for (const step of preBakeSteps) {
      for (const n of (step.ingredients_added || [])) usedNames.add(String(n).toLowerCase().trim());
    }
    const missing = [...ingredientNames].filter((n) => n && !usedNames.has(n));
    const extra = [...usedNames].filter((n) => n && !ingredientNames.has(n));

    const process = {
      method: exProcess.method || null,
      pre_bake: {
        steps: preBakeSteps,
        dough_temp_target: exProcess?.pre_bake?.dough_temp_target ?? null,
        dough_temp_unit: exProcess?.pre_bake?.dough_temp_unit ?? null,
      },
      forming: exProcess.forming || { machine: null, target_deposit_weight_raw: null, weight_unit: null, die_or_wire: null, notes: null },
      bake: exProcess.bake || { time_minutes: pick(concept?.baking_time_minutes ? Number(concept.baking_time_minutes) : null), temperature: pick(concept?.baking_temp ? Number(concept.baking_temp) : null), temp_unit: concept?.baking_temp_unit || null, expected_loss_pct: null },
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

    // ---------- SERVICES TO OFFER ----------
    const services: string[] = [];
    if (!exOpt.nutritional_panel) services.push("Nutritional panel development");
    if (!exOpt.allergens) services.push("Allergen declaration & risk review");
    if (!exOpt.shelf_life) services.push("Shelf-life study & validation");
    if (!process.bake.temperature || !process.bake.time_minutes) services.push("Bake profile development (time/temp)");
    if (!packaging.palletizing.cases_per_pallet) services.push("Palletization & shipping plan");
    if (!process.method) services.push("Process method classification & equipment plan");

    // ---------- CONFIDENTIAL FORMULA AUTO-CREATE ----------
    let conceptId: number | null = concept?.id || null;
    let formulaId: string | null = null;
    if (normalizedIngredients.length > 0) {
      if (conceptId) {
        const { data: existing } = await admin.from("formulas").select("id").eq("concept_id", conceptId).limit(1).maybeSingle();
        if (!existing) {
          const rows = normalizedIngredients.map((i) => ({
            concept_id: conceptId,
            user_id: clientUserId,
            ingredient_name: i.name,
            ingredient_category: i.category,
            weight_g: i.weight,
            percentage: i.percentage || 0,
            percentage_formula: i.percentage,
            notes: i.notes,
          }));
          const { data: inserted } = await admin.from("formulas").insert(rows).select("id").limit(1);
          formulaId = inserted?.[0]?.id || null;
        } else {
          formulaId = existing.id;
        }
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

    const { data: upserted, error: upsertErr } = await admin
      .from("batch_sheets")
      .upsert({
        pss_document_id,
        lead_id: lead?.id || null,
        client_user_id: clientUserId,
        concept_id: conceptId,
        status: "draft",
        data_json: dataJson,
        generated_from: "pss",
        updated_at: new Date().toISOString(),
      }, { onConflict: "pss_document_id" })
      .select()
      .single();

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    if (lead?.profile_id) {
      await admin.from("client_activity").insert({
        client_id: lead.profile_id,
        actor_id: caller.id,
        action: "batch_sheet_drafted",
        payload: {
          pss_document_id,
          batch_sheet_id: upserted.id,
          formula_id: formulaId,
          recipe_warnings: recipeWarnings,
          services_offered: services,
        },
      });
    }

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
