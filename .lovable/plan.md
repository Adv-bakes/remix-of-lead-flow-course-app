## What's broken

You accepted Bahama Burger in Documents Inbox. Three real bugs surfaced (the email failure is separate — see end):

1. **Card didn't move out of "Lead In"** on the dashboard.
   `SalesDashboard` reads `prf_submissions.sales_stage`. The accept flow only sets `prf_submissions.status = "accepted"` and `sales_leads.stage = "Send Documents"` — it never touches `sales_stage`. So the card stays in Lead In.

2. **Card not clickable.**
   The card link is `lead_id ? /team/sales/clients/{lead_id}/projects/{prf_id} : "#"`. When a PRF is created via "Add Deal" (file upload) there is no matching `sales_leads` row yet, so `lead_id` is null and the link is dead.

3. **No way to trigger a batch sheet.**
   `SalesProjectWorkspace` only shows a disabled "Open batch sheet" button with the hint "generates from approved PSS". There's no button to actually start that generation, and from the dashboard there's no path into the workspace at all (see #2).

(The toast "Email didn't send… Magic link copied" is working as designed — Resend's `adventurebakery.info` isn't verified yet. That's a DNS step on your side, not a code bug. Plan keeps that behavior.)

## Fix

### 1. Accept advances the project on the dashboard

In `SalesDocumentsInbox.accept()`, when the PRF is accepted:
- Update `prf_submissions`: `status = "accepted"`, `sales_stage = "Send Documents"`, `sales_stage_updated_at = now()`.
- If a matching `sales_leads` row exists by email, link it: set `prf_submissions.lead_id = lead.id` (only if currently null). This also fixes #2 retroactively.
- If no lead exists, auto-create a minimal `sales_leads` row from the PRF fields (email, contact_name=founder_name, company_name, stage="Send Documents") and link it. This guarantees every accepted PRF has a clickable destination.

### 2. Card always opens a workspace

In `SalesDashboard.tsx`, change the card link:
- If `lead_id` exists → `/team/sales/clients/{lead_id}/projects/{prf_id}` (unchanged).
- Else → fall back to `/team/sales/clients/{prf_id}/projects/{prf_id}` is not valid. Instead, after fix #1 every accepted PRF has a `lead_id`. For not-yet-accepted PRFs still on the board, link to the Documents Inbox row: `/team/sales/documents?prf={prf_id}` (or just keep them in Lead In with a tooltip "Accept in Documents Inbox to open").
- Simpler: render unlinked cards as non-clickable with a subtle "Accept in inbox" hint, and linked cards as a real link. No dead `#` hrefs.

### 3. Make the batch-sheet trigger visible

In `SalesProjectWorkspace.tsx`, replace the disabled "Open batch sheet" placeholder with two states:
- **No batch sheet yet** → primary button "Generate batch sheet" that calls the existing `generate-batch-sheet-from-pss` edge function with the PRF's latest approved PSS. On success, reload and show "Open batch sheet".
- **Batch sheet exists** → keep current "Open batch sheet" behavior, plus a small "Regenerate" link.
- If there's no approved PSS yet, show the button disabled with the existing copy ("Once the client returns the PSS…"). No behavior change in that case.

This puts a clear, single trigger inside the project workspace — reachable from the (now clickable) dashboard card.

## Files changed

- `src/pages/sales/SalesDocumentsInbox.tsx` — accept() also writes `sales_stage`, ensures `lead_id` (link or auto-create lead).
- `src/pages/sales/SalesDashboard.tsx` — card renders as link only when `lead_id` is set; no `href="#"`.
- `src/pages/sales/SalesProjectWorkspace.tsx` — add "Generate batch sheet" action when PSS is approved and no batch sheet exists.

## Out of scope

- Resend domain verification (DNS work on your side, or switch to Lovable Emails later).
- Reworking the Documents Inbox lanes / drag-drop on the dashboard (already works, per your message).
