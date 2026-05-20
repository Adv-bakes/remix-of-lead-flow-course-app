## What's wrong today

Comparing your uploaded PSS and Batch Sheet templates to what the app renders:

**PSS preview** (`PssPreviewDrawer.tsx`) only renders the handful of fields we managed to extract. Empty sections of the template (nutrition table, allergen grid, QC specs, certifications/claims, ingredient source/grade column, processing steps, document history) are hidden — so you can't fill in what's missing.

**Batch Sheet editor** (`BatchSheetEditor.tsx`):
- The white pill chips at the top are `tp-btn` outline buttons that lose contrast on the black surface — the "white cells / illegible menu" you screenshotted.
- The recipe grid only allows editing vendor / case-weight columns. `#`, `Ingredient`, `%`, `Weight (g)` are static text, so you can't paste or correct the formula.
- The grid is only "weight in grams". Your template is a **formula calculator**: `% Formula`, per-unit weight (e.g. `original 16/pk`), grams-per-unit, and a scaled column that recomputes for whatever order quantity is being run. None of that exists.
- Process / Method block is read-only, which is why you couldn't paste the method in.
- "Total batch weight" is shown front-and-centre even though it has no meaning on either document — it changes per order.

## Constraints to respect

- **Sourcing Bot depends on this data.** Keep the existing JSON keys it reads stable: `recipe.ingredients[*].name`, `weight`, `weight_g`, `weight_unit`, `percentage`, `vendor_1/2/3`, `vendor_notes`, plus `packaging.*`, `header.*`, `product.*`. New fields are added alongside, never renamed or removed.
- **Total batch weight has no purpose** on the PSS or the Batch Sheet (it varies per order). Remove the field from both editors and from the summary cards. The recipe stays a *per-unit formula*; scaling for a specific order happens at production time on the Production Batch screen, not here.

## Plan

### 1. PSS preview — show the full template, blank fields included
Rewrite `PssPreviewDrawer.tsx` so every section of the AB PSS template is always rendered as editable inputs, even when the value is blank:
- Header (already present) + Date, Prepared by, Approved by
- 1 Product Description (category, appearance, texture, intended use, shelf life)
- 2 Nutrition table (8 rows × amount/%DV, editable grid)
- 3 Allergen declaration (Milk, Eggs, Tree nuts, Peanuts, Wheat/Gluten, Soy, Sesame — Yes/No + source)
- 4 Packaging (primary name/size, secondary, label requirements, shipper, units/case)
- 5 Storage & shelf life
- 6 QC specs (weight, dimensions, color, moisture, pH, micro limits)
- 7 Certifications/Claims (Kosher, GF, Organic, Non-GMO, Halal, None)
- 8 Ingredients table — name, % or per-unit weight, **source/grade/spec**, function/purpose
- 9 Processing steps (Step 1–8 + oven temp + bake time) — client-supplied, PSS-side only
- 10 Document history (version / date / changes / approved by)

Remove the "Total batch weight" and "Recipe weight unit" fields from the PSS recipe block.

All saved to `client_documents.review_notes.extracted` under the same shape so reconcile and the sourcing bot keep working. New sub-keys added under `nutrition`, `allergens`, `qc`, `certifications`, `document_history` — additive only, no rename of anything the bot reads.

### 2. Batch Sheet editor — rebuild around the per-unit formula calculator
Replace the current recipe grid in `BatchSheetEditor.tsx` with a layout that mirrors your template:

```text
# | Ingredient (editable) | % Formula | Per-Unit Wt | Grams (per unit) | Preblend | Vendor 1 | Vendor 2 | Vendor 3 | Notes
```

- All cells editable (including `#`, `Ingredient`, `%`, weights).
- `%` auto-computes from `grams_per_unit / sum(grams_per_unit)` when grams changes, and vice-versa. Sum-of-% must equal 100; show a red badge if it drifts.
- Footer row showing summed `%` (with the drift badge) — no "total batch weight" anywhere.
- Add **Processing Specifications** block above the recipe, editable: Recipe Method & Procedure (multi-step rows with `# ingredients to kettle`, `min to melt`, `# ingredients to mixer`, `total mix min`, `Low/Med/High speed` columns from the template), plus Bake @ Temp / Min row. Free-text "Method" paste area at the top of this block so you can drop in the method text you tried to paste earlier.
- Keep the existing Packaging block but make it editable.
- Keep History / Sync / Regenerate / Export / Approve actions.
- Remove the "Total batch" summary card. Replace with "Unit weight (raw)" and "Method" only.

Saves go through `revise-batch-sheet` (already versioned). `data_json` gets two new sub-keys: `process.specifications` (structured) and `process.method_text` (free-text paste). The xlsx exporter already reads `process.pre_bake.steps`; on save we'll also mirror the structured rows into that existing path so the Excel export keeps producing the same file without changes.

### 3. Header chips legibility
The five white pills at the top of the editor are caused by `tp-btn` rendering on the dark `tp-surface`. Fix:
- Restyle `tp-btn` (or add a `tp-btn-ghost` variant) so default state is transparent with a 1px gold/hairline border and `--tp-text` label.
- Active/primary keeps the current filled look.
- Apply to both the BatchSheetEditor and PssPreviewDrawer headers.

### 4. Out of scope (call out so we don't drift)
- AI auto-fill of PSS blanks from the batch sheet — already handled by `reconcile-pss-batch`. We're only making the blanks visible/editable. Reconcile keeps copying the same field set the sourcing bot reads.
- Order-quantity scaling — belongs on the Production Batch screen, not the formula sheet.
- xlsx export redesign — current exporter already matches the AB column layout; the structured-row mirror above preserves it.
- PSS Section 9 (client steps) and batch-sheet processing specs are kept separate and never synced; only the batch sheet specs are proprietary.

### Files touched
- `src/components/sales/PssPreviewDrawer.tsx` — full rewrite of body, same save contract, total-batch field removed.
- `src/pages/team/operations/BatchSheetEditor.tsx` — editable recipe grid, editable process block with method paste area, summary cards trimmed.
- `src/index.css` (or wherever `tp-btn` lives) — chip contrast fix.
- No DB migration. No edge function changes. Sourcing-bot field contract unchanged.
