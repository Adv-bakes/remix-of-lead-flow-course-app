## Goal
Make PSS approval behave like an operational handoff: show the right AI recommendations, generate a usable batch sheet from the reviewed PSS, and take the salesperson into the client folder instead of leaving them in the inbox.

## Plan

1. **Correct the AI review offer logic and review copy**
   - Update the PSS review function so service recommendations match your rules:
     - replace “recipe optimization / total batch weight calculator” with **Formula calculator**
     - never offer **process development**
     - offer **packaging design & optimization** only when packaging details are missing
     - offer **nutritional panel** only when that section is missing
   - Update the review panel text so the “will populate batch sheet” preview reflects what will actually be created.

2. **Fix the approval handoff from inbox to client folder**
   - Change the PSS approval flow in the review panel so after approval + batch-sheet generation it navigates to the related **client folder** instead of just closing the drawer.
   - Keep the inbox refresh, but make the primary handoff route the salesperson into the client context immediately.
   - Add a safe fallback toast if the client/lead link cannot be resolved.

3. **Fix the empty batch sheet problem in the sales workspace**
   - Update the sales workspace to use the **latest active batch-sheet version** instead of the old single-row lookup.
   - Align the UI with the new batch-sheet JSON shape:
     - use `data_json.header`
     - use `data_json.recipe.ingredients`
     - use `data_json.process.pre_bake.steps`
     - use `data_json.packaging`
   - Use the edge function response directly after generation so the workspace opens the generated sheet immediately.
   - Remove stale assumptions from the mini preview that still read the old flat structure.

4. **Wire the structured Adventure Bakery batch-sheet layout**
   - Replace the current generic export mapping with the structured batch-sheet template you referenced.
   - Map the generated data into the template’s real sections/fields, including version and changed date.
   - If the template is not yet stored in the project’s template system, add a dedicated template slot so exports always use the correct workbook layout.
   - Keep vendor/staff-editable fields intact so later versions remain editable.

5. **Validate the full operator flow**
   - Re-test this sequence in preview:
     1. run AI review
     2. approve PSS
     3. confirm redirect to client folder
     4. open batch sheet from the folder/workspace
     5. confirm ingredients/process/packaging fields actually render
   - Verify batch-sheet export uses the structured template and includes version/date metadata.

## Technical details
- **Files likely to change**
  - `supabase/functions/review-client-document/index.ts`
  - `src/components/sales/DocumentReviewPanel.tsx`
  - `src/pages/sales/SalesProjectWorkspace.tsx`
  - `supabase/functions/export-batch-sheet-xlsx/index.ts`
  - possibly template-related files if the batch-sheet workbook needs a dedicated template slot

- **Important implementation notes**
  - The network log shows `generate-batch-sheet-from-pss` returned `200`, so this is not just a failed function call.
  - The sales workspace is still reading the **old batch-sheet shape**, which explains why “Open Batch Sheet” looks empty even though generation ran.
  - The inbox approval flow currently calls generation but does **not** navigate anywhere afterward.
  - The current project already supports template storage for NDA/PSS/PRF; batch-sheet export may need to be brought into that same pattern for your structured template.