
## Issues to fix

1. **PSS processing steps** are capped at 8 rows. Need an "Add step" button (unlimited rows, numbered).
2. **Bake block** needs a third field: `Baked Internal Temperature Target` (below temp + time). "None" must be acceptable for non-baked products.
3. **Batch sheet does not inherit processing steps** from the PSS. It should copy them as the starting point.
4. **Once team edits batch-sheet steps, the AB version diverges** from the client-submitted PSS and must never auto-revert. Each save creates a new AB-side version.
5. **Recipe on batch sheet shows only grams.** It needs `% Formula` as the primary column so the team can scale to any batch weight at production time.
6. **Process numbering** on the batch sheet must mirror the PSS step numbers (Step 1, Step 2, …), even when steps span different stations (kettle, mixer, sheeter, oven, etc.). Add a "Station" column.
7. **Packaging — Primary vessel** is being auto-filled with the product name ("Bahama Burgers"). That field must hold a vessel type (tray, bag, film, flow-wrap, pouch, clamshell, etc.), not the product name.
8. **PSS is missing the Shipper Case tier.** Packaging today has Primary + Secondary only. Need a third tier:
   - Primary vessel (e.g. 5×9 pre-made bag, 2 units)
   - Secondary package = retail display / retail box (holds N primaries → M units)
   - **Shipper case** (holds N secondaries → total units/case)

## Plan

### A. PSS Preview & Editor (`PssPreviewDrawer.tsx`)

**Processing steps — Section 9**
- Replace the fixed 8-row grid with a dynamic list.
- Each row: `#` (auto), `Station` (free-text or select: Prep / Kettle / Mixer / Sheeter / Oven / Cool / Pack / Other), `Action / Description`, `Time (min)`, `Temp`, `Notes`.
- "+ Add step" button at the bottom. "Remove" icon per row. Re-numbers automatically.

**Bake block**
- Keep `Bake Temp` and `Bake Time` (existing).
- Add `Baked Internal Temperature Target` directly below, with unit selector (°F/°C). Accept blank or "None" for non-baked products.
- Saved as `bake.internal_temp_target` and `bake.internal_temp_unit` under `extracted` (additive, sourcing-bot safe).

**Packaging — Section 4 (full rebuild of the packaging block)**
Three tiers, each editable, every field shown even when blank:

```
Primary vessel
  - Vessel type (select: Bag, Pouch, Tray, Clamshell, Film/Flow-wrap, Jar, Bottle, Box, Other)
  - Vessel size / spec (e.g. "5×9 pre-made bag")
  - Units per primary pack
  - Net weight per primary pack + unit

Secondary package (retail display / retail box)
  - Type (select: Retail box, Retail display, Caddy, Shrink bundle, None, Other)
  - Primaries per secondary
  - Units per secondary  (auto = primaries × units_per_primary, editable override)

Shipper case
  - Case type (Corrugated RSC, Telescoping, Tray pack, Other)
  - Secondaries per case
  - Units per case  (auto = secondaries × units_per_secondary, editable override)
  - Cases per pallet
```

**Fix product-name-as-vessel bug**
- The extractor/reconciler is writing `product.product_name` into `packaging.primary.vessel`. Audit `ingest-batch-sheet`, `finalize-pss-submission`, and `reconcile-pss-batch` field maps and remove that mapping. Vessel must come from packaging extraction only.
- For any existing rows where `packaging.primary.vessel` equals `header.product_name`, treat it as blank in the UI (show placeholder, don't display the product name as the vessel).

### B. Batch Sheet Editor (`BatchSheetEditor.tsx`)

**Recipe grid — % Formula is the source of truth**
- Columns: `# | Ingredient | % Formula | Per-unit g | Preblend | Vendor 1/2/3 | Notes`.
- `%` is the primary editable column. `Per-unit g` is a convenience display computed from `%` and the editable `Unit weight (raw)` field above the grid.
- Footer shows summed `%` with red badge if ≠100. No "total batch weight" field anywhere.
- At production time, the Production Batch screen multiplies `%` by the order's target batch weight — that scaling does not live on this sheet.

**Processing steps — inherit from PSS, then diverge**
- On first creation of an AB batch sheet, copy `pss.processing_steps[]` verbatim into `batch.process.specifications.steps[]`.
- Renumber on the batch sheet using the PSS step numbers (1, 2, 3…). Add the `Station` column.
- Once any team edit is saved, the batch sheet's steps are independent. `reconcile-pss-batch` must **never** copy PSS steps back over batch-sheet steps after the initial seed. Add a flag `process.seeded_from_pss_at` so reconcile knows the seed has happened.
- "+ Add step" / remove / reorder available on the batch sheet too.

**AB-side versioning**
- `batch_sheets` already has `version` / `superseded_at` / `superseded_by_version`. Confirm each save via `revise-batch-sheet` increments the version and supersedes the prior row (already implemented for batch sheets).
- **New:** PSS itself also needs AB-side versioning. Today `client_documents.review_notes.extracted` is overwritten in place. Change so that each team-side save snapshots the previous `extracted` into `review_notes.versions[]` with `{version, saved_at, saved_by, extracted}`. Client-submitted v1 (original PSS upload) is preserved as `versions[0]` and never overwritten.
- Add a "Version history" dropdown in the PSS drawer header showing each version with timestamp + author, and a "View" action (read-only diff/restore later — out of scope for this pass, just store the history).

**Packaging block on batch sheet**
- Mirror the three-tier structure from the PSS (Primary / Secondary / Shipper case), editable.

### C. Edge function updates

- `reconcile-pss-batch`:
  - Add Shipper-case fields to `FIELD_MAP` (`packaging.shipper.case_type`, `secondaries_per_case`, `units_per_case`, `cases_per_pallet`).
  - Add bake internal-temp fields.
  - **Stop copying processing steps from PSS to batch sheet after `process.seeded_from_pss_at` is set.** First-time seed only.
  - Stop ever copying `header.product_name` into `packaging.primary.vessel`.
- `ingest-batch-sheet` / `finalize-pss-submission`: same vessel-name fix; ensure shipper case fields are parsed.
- `generate-batch-sheet-from-pss`: seed `batch.process.specifications.steps` from `pss.processing_steps`, set `seeded_from_pss_at` timestamp, copy three packaging tiers.

### D. Out of scope for this pass

- PSS version diff/restore UI (we only persist history now).
- Production-time scaling of % to a batch weight (lives on Production Batch screen).
- xlsx export redesign — existing exporter keeps reading `process.pre_bake.steps` and `recipe.ingredients`; we'll mirror the new step rows back to that path on save.

### Files touched

- `src/components/sales/PssPreviewDrawer.tsx` — dynamic steps, internal temp, 3-tier packaging, version-history dropdown.
- `src/pages/team/operations/BatchSheetEditor.tsx` — `%`-first recipe grid, Station column, dynamic steps, 3-tier packaging.
- `supabase/functions/reconcile-pss-batch/index.ts` — field map additions, vessel-name fix, seed-once rule for steps.
- `supabase/functions/generate-batch-sheet-from-pss/index.ts` — seed steps + packaging tiers, set `seeded_from_pss_at`.
- `supabase/functions/ingest-batch-sheet/index.ts` and `finalize-pss-submission/index.ts` — vessel-name fix, shipper-case parsing.
- No DB migration required — all new fields live inside existing `jsonb` columns. PSS version history goes into `client_documents.review_notes.versions[]`.
