# Fix PSS → Batch Sheet sync

## Problem

For Bahama Burger:
- PSS `recipe.ingredients[*].weight` = 10, 6, 6, 12, … (populated)
- Batch sheet `recipe.ingredients[*].weight` = null on every row (placeholders generated from the PSS row names only)

`reconcile-pss-batch` only copies the **whole ingredient array** when one side's array length is 0. Because the batch sheet already had 20-ish rows with `name` filled and other fields null, reconcile considered "both sides have ingredients" and copied nothing. Saving the PSS therefore appeared to do nothing on the batch sheet side.

## Fix

### 1. Per-ingredient field-level merge (`supabase/functions/reconcile-pss-batch/index.ts`)

Replace the current all-or-nothing block with a row-by-row merge:

- Match rows between PSS and batch sheet by **normalized ingredient name** (lowercase, trimmed). Fall back to index when names are missing.
- If a batch-sheet row exists for a PSS ingredient name, fill these batch fields only when they are blank:
  - `weight`, `weight_g`, `weight_unit`, `percentage`, `category`, `notes`
  - Never touch `vendor_1/2/3`, `vendor_notes`, `vendor_source`, `case_weight*` (those are staff-only)
- If a PSS row exists for a batch ingredient and the PSS side is blank, fill `name`, `weight`, `weight_unit`, `percentage` back to PSS.
- If a PSS ingredient has no batch-side match, append it as a new batch row (with vendor fields null).
- Increment `pss_filled_count` / `batch_filled_count` per field changed and add per-row entries to `pss_changes` / `batch_changes` for the toast.

Keep the existing scalar `FIELD_MAP` behavior unchanged.

### 2. Retrigger points

Currently sync only runs from the PSS drawer Save and the (now broken) ingredient copy. Also call `reconcile-pss-batch` from:

- `supabase/functions/generate-batch-sheet-from-pss/index.ts` — after the batch sheet is inserted, so a freshly generated batch sheet inherits PSS values immediately (today the generator builds skeleton rows with null weights, which is exactly what bit us).
- `supabase/functions/revise-batch-sheet/index.ts` — after the AI revision saves, so batch-sheet edits flow back to PSS blanks.

### 3. Manual "Sync now" from the Batch Sheet editor

`src/pages/team/operations/BatchSheetEditor.tsx` should expose the same Sync button the PSS drawer has (calls `reconcile-pss-batch` with `{ batch_sheet_id }`) and refresh on success. This gives staff a one-click way to pull PSS updates without reopening the PSS.

### 4. One-time backfill for the current Bahama Burger sheet

After deploy, the user can hit Sync from either side and the 16 ingredient weights will populate. No migration needed — the data is already in the PSS.

## Out of scope

- Conflict resolution when both sides have different non-null values (still leave both alone; surface "X conflicts" in the toast in a follow-up).
- Process steps remain batch-sheet-only (proprietary).
- Packaging palletizing dims, secondary case dims — covered by existing scalar FIELD_MAP, not changed here.

## Files touched

- `supabase/functions/reconcile-pss-batch/index.ts` — new per-row merge.
- `supabase/functions/generate-batch-sheet-from-pss/index.ts` — call reconcile at the end.
- `supabase/functions/revise-batch-sheet/index.ts` — call reconcile at the end.
- `src/pages/team/operations/BatchSheetEditor.tsx` — add Sync button + handler.
